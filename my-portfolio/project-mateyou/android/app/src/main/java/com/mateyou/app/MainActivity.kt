package com.mateyou.app

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.View
import android.app.NotificationManager
import android.view.Window
import android.view.WindowManager
import android.app.KeyguardManager
import android.os.PowerManager
import android.webkit.PermissionRequest
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.getcapacitor.BridgeActivity
import com.getcapacitor.BridgeWebChromeClient

class MainActivity : BridgeActivity() {
    companion object {
        private const val TAG = "MainActivity"
        private const val PERMISSIONS_REQUEST_CODE = 1001
    }
    
    // FCM에서 수신 통화 알림을 받는 BroadcastReceiver
    private val incomingCallReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == "com.mateyou.app.INCOMING_CALL") {
                val callerId = intent.getStringExtra("caller_id") ?: return
                val callerName = intent.getStringExtra("caller_name") ?: "알 수 없음"
                val roomName = intent.getStringExtra("room_name") ?: return
                val livekitUrl = intent.getStringExtra("livekit_url") ?: return
                val callType = intent.getStringExtra("call_type") ?: "voice"
                
                Log.d(TAG, "📞 Received incoming call broadcast: $callerName, $roomName")
                
                // JavaScript 문자열 이스케이프 처리
                val safeCallerName = callerName.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n")
                
                // WebView에 이벤트 전달
                runOnUiThread {
                    val jsCode = """
                        window.dispatchEvent(new CustomEvent('native-incoming-call', { 
                            detail: { 
                                callerId: '$callerId', 
                                callerName: '$safeCallerName', 
                                roomName: '$roomName', 
                                livekitUrl: '$livekitUrl',
                                callType: '$callType',
                                autoAccept: false 
                            } 
                        }));
                    """.trimIndent()
                    
                    bridge?.webView?.evaluateJavascript(jsCode, null)
                    Log.d(TAG, "✅ Incoming call event sent to WebView")
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        // 플러그인 등록 - super.onCreate() 이전에 해야 함!
        registerPlugin(AudioTogglePlugin::class.java)
        registerPlugin(LiveKitPlugin::class.java)
        Log.d(TAG, "✅ Plugins registered BEFORE super.onCreate()")

        supportRequestWindowFeature(Window.FEATURE_NO_TITLE)
        super.onCreate(savedInstanceState)
        
        // BroadcastReceiver 등록
        val filter = IntentFilter("com.mateyou.app.INCOMING_CALL")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(incomingCallReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(incomingCallReceiver, filter)
        }
        Log.d(TAG, "✅ Incoming call receiver registered")

        // ActionBar 숨기기
        supportActionBar?.hide()
        actionBar?.hide()

        setupSystemBars()

        ViewCompat.setOnApplyWindowInsetsListener(findViewById(android.R.id.content)) { v, windowInsets ->
            val insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(0, insets.top, 0, insets.bottom)
            WindowInsetsCompat.CONSUMED
        }

        requestAudioPermissions()
        // 오디오 모드는 실제 통화 시작 시에만 설정 (LiveKitPlugin이 담당)
        configureWebViewSettings()
        handleIntent(intent)
        
        // Android 14+: fullScreenIntent 권한 체크 (통화 수신 UI 표시에 필수!)
        checkFullScreenIntentPermission()
    }
    
    private fun checkFullScreenIntentPermission() {
        if (Build.VERSION.SDK_INT >= 34) { // Android 14 (API 34)
            val notificationManager = getSystemService(NotificationManager::class.java)
            if (!notificationManager.canUseFullScreenIntent()) {
                Log.w(TAG, "⚠️ Full screen intent permission not granted!")
                try {
                    // 설정 화면으로 이동하여 권한 허용 유도
                    val intent = Intent(
                        android.provider.Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
                        Uri.parse("package:$packageName")
                    )
                    startActivity(intent)
                    Log.d(TAG, "📱 Opened full screen intent settings")
                } catch (e: Exception) {
                    Log.e(TAG, "❌ Failed to open settings", e)
                }
            } else {
                Log.d(TAG, "✅ Full screen intent permission granted")
            }
        }
    }

    private fun setupSystemBars() {
        window.apply {
            clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS)
            addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
            statusBarColor = Color.parseColor("#FE3A8F")
            navigationBarColor = Color.BLACK
        }

        var flags = window.decorView.systemUiVisibility
        flags = flags and View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR.inv()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            flags = flags and View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR.inv()
        }
        window.decorView.systemUiVisibility = flags

        Log.d(TAG, "✅ System bars configured")
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            setupSystemBars()
        }
    }

    private fun requestAudioPermissions() {
        val permissions = mutableListOf(
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.MODIFY_AUDIO_SETTINGS,
            Manifest.permission.CAMERA
        )
        
        // Android 13+ (API 33): POST_NOTIFICATIONS 런타임 권한 필수!
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }

        val needsRequest = permissions.any {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        if (needsRequest) {
            Log.d(TAG, "🎤 Requesting permissions: $permissions")
            ActivityCompat.requestPermissions(this, permissions.toTypedArray(), PERMISSIONS_REQUEST_CODE)
        } else {
            Log.d(TAG, "✅ All permissions already granted")
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)

        if (requestCode == PERMISSIONS_REQUEST_CODE) {
            permissions.forEachIndexed { index, permission ->
                val granted = grantResults.getOrNull(index) == PackageManager.PERMISSION_GRANTED
                Log.d(TAG, "${if (granted) "✅" else "⚠️"} $permission: ${if (granted) "granted" else "denied"}")
            }
        }
    }

    private fun configureWebViewSettings() {
        try {
            bridge.webView?.apply {
                settings.apply {
                    mediaPlaybackRequiresUserGesture = false
                    javaScriptEnabled = true
                    domStorageEnabled = true
                    allowFileAccess = true
                    allowContentAccess = true
                }
                webChromeClient = WebRTCWebChromeClient()
            }
            Log.d(TAG, "✅ WebView settings configured for WebRTC")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to configure WebView settings: ${e.message}")
        }
    }

    private inner class WebRTCWebChromeClient : BridgeWebChromeClient(bridge) {
        override fun onPermissionRequest(request: PermissionRequest) {
            Log.d(TAG, "🎙️ WebView permission request received")
            request.resources.forEach { resource ->
                Log.d(TAG, "  - Requested resource: $resource")
            }

            runOnUiThread {
                try {
                    request.grant(request.resources)
                    Log.d(TAG, "✅ WebView permissions granted for WebRTC")
                } catch (e: Exception) {
                    Log.e(TAG, "❌ Failed to grant permissions: ${e.message}")
                    super.onPermissionRequest(request)
                }
            }
        }
    }

    override fun onPause() {
        super.onPause()
        Log.d(TAG, "App paused - keeping audio active")
    }

    override fun onResume() {
        super.onResume()
        Log.d(TAG, "App resumed")
    }
    
    override fun onDestroy() {
        try {
            unregisterReceiver(incomingCallReceiver)
            Log.d(TAG, "✅ Incoming call receiver unregistered")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error unregistering receiver: ${e.message}")
        }
        super.onDestroy()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private var wakeLock: PowerManager.WakeLock? = null
    
    private fun setupLockScreenFlags() {
        // 잠금화면 위에 표시 + 화면 켜기
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            
            val keyguardManager = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
            keyguardManager.requestDismissKeyguard(this, null)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            )
        }
        
        window.addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
            WindowManager.LayoutParams.FLAG_ALLOW_LOCK_WHILE_SCREEN_ON
        )
        
        // WakeLock으로 화면 강제 켜기
        try {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(
                PowerManager.FULL_WAKE_LOCK or
                PowerManager.ACQUIRE_CAUSES_WAKEUP or
                PowerManager.ON_AFTER_RELEASE,
                "mateyou:CallScreen"
            )
            wakeLock?.acquire(60000) // 60초
            Log.d(TAG, "✅ WakeLock acquired for call screen")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to acquire WakeLock", e)
        }
    }
    
    private fun clearLockScreenFlags() {
        try {
            wakeLock?.let {
                if (it.isHeld) {
                    it.release()
                    Log.d(TAG, "✅ WakeLock released")
                }
            }
            wakeLock = null
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to release WakeLock", e)
        }
        
        // 플래그 제거 (선택적 - 통화 종료 후)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(false)
            setTurnScreenOn(false)
        } else {
            @Suppress("DEPRECATION")
            window.clearFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            )
        }
    }
    
    private fun handleIntent(intent: Intent?) {
        if (intent == null || bridge?.webView == null) return

        val intentType = intent.getStringExtra("type")
        if (intentType == "incoming_call" || intentType == "accept_call") {
            // 잠금화면 위에 표시 설정
            setupLockScreenFlags()
            val callerId = intent.getStringExtra("caller_id") ?: ""
            var callerName = intent.getStringExtra("caller_name") ?: ""
            val roomName = intent.getStringExtra("room_name") ?: ""
            val livekitUrl = intent.getStringExtra("livekit_url") ?: ""
            var livekitToken = intent.getStringExtra("livekit_token") ?: ""
            val callType = intent.getStringExtra("call_type") ?: "voice"
            
            // Intent에 token이나 callerName이 없으면 SharedPreferences에서 가져옴
            val prefs = getSharedPreferences("incoming_call", Context.MODE_PRIVATE)
            if (livekitToken.isEmpty()) {
                livekitToken = prefs.getString("livekit_token", "") ?: ""
            }
            if (callerName.isEmpty()) {
                callerName = prefs.getString("caller_name", "알 수 없음") ?: "알 수 없음"
            }

            Log.d(TAG, "📞 Incoming call intent - caller: $callerName, room: $roomName, hasToken: ${livekitToken.isNotEmpty()}")

            // JavaScript 문자열 이스케이프 처리
            val safeCallerName = callerName.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n")
            
            val jsCode = """
                window.dispatchEvent(new CustomEvent('native-incoming-call', { 
                    detail: { 
                        callerId: '$callerId', 
                        callerName: '$safeCallerName', 
                        roomName: '$roomName', 
                        livekitUrl: '$livekitUrl',
                        livekitToken: '$livekitToken',
                        callType: '$callType',
                        autoAccept: ${intentType == "accept_call"} 
                    } 
                }));
            """.trimIndent()

            bridge.webView.evaluateJavascript(jsCode, null)
            return
        }

        intent.data?.let { data ->
            Log.d(TAG, "Intent received - Full URI: $data")

            if ((data.scheme == "https" || data.scheme == "capacitor") && data.host == "localhost") {
                val jsCode = "window.dispatchEvent(new CustomEvent('oauth-redirect', { detail: { url: '$data' } }));"
                bridge.webView.evaluateJavascript(jsCode, null)
            }
        }
    }
}

