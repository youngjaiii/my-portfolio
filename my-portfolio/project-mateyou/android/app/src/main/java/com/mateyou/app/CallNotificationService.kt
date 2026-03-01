package com.mateyou.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Person
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.Person as PersonCompat
import androidx.core.graphics.drawable.IconCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin

class CallNotificationService : FirebaseMessagingService() {
    companion object {
        private const val TAG = "CallNotificationService"
        private const val CHANNEL_ID = "incoming_calls"
        private const val CHANNEL_NAME = "수신 통화"
        private const val NOTIFICATION_ID = 1001
    }

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "🚀 CallNotificationService onCreate")
        createNotificationChannel()
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        
        Log.d(TAG, "📩 ==========================================")
        Log.d(TAG, "📩 FCM message received from: ${remoteMessage.from}")
        Log.d(TAG, "📩 Message ID: ${remoteMessage.messageId}")
        Log.d(TAG, "📩 Message type: ${remoteMessage.messageType}")
        Log.d(TAG, "📩 Notification: ${remoteMessage.notification?.title} - ${remoteMessage.notification?.body}")
        
        val data = remoteMessage.data
        val notificationType = data["type"]
        
        Log.d(TAG, "📩 Data type: $notificationType")
        Log.d(TAG, "📩 Data: $data")
        Log.d(TAG, "📩 ==========================================")
        
        when (notificationType) {
            "livekit-call" -> {
                Log.d(TAG, "📞 Processing livekit-call")
                handleIncomingCall(data)
            }
            else -> {
                // 다른 타입의 알림은 Capacitor 플러그인으로 포워딩
                Log.d(TAG, "📩 Forwarding to Capacitor PushNotifications plugin")
                try {
                    PushNotificationsPlugin.sendRemoteMessage(remoteMessage)
                } catch (e: Exception) {
                    Log.e(TAG, "❌ Failed to forward to Capacitor: ${e.message}")
                }
            }
        }
    }

    private fun handleIncomingCall(data: Map<String, String>) {
        val callerId = data["caller_id"] ?: return
        val callerName = data["caller_name"] ?: "알 수 없음"
        val roomName = data["room_name"] ?: return
        val livekitUrl = data["livekit_url"] ?: return
        val livekitToken = data["livekit_token"] ?: return
        val callType = data["callType"] ?: "voice"
        
        Log.d(TAG, "📞 Incoming call from: $callerName ($callerId)")
        Log.d(TAG, "📞 Room: $roomName, URL: $livekitUrl, Type: $callType")
        
        // 통화 데이터 저장 (수락 시 사용)
        saveCallData(callerId, callerName, roomName, livekitUrl, callType, livekitToken)
        
        // ★★★ 항상 시스템 알림 표시 (카카오톡 방식) ★★★
        // - 앱 화면 보고 있을 때: WebView 모달 + 상단 알림
        // - 다른 앱 사용 중: 상단 알림만 보임
        // - 백그라운드/잠금: fullScreenIntent로 전체화면
        Log.d(TAG, "📞 Showing system notification (always)")
        showIncomingCallNotification(callerId, callerName, roomName, livekitUrl, callType)
    }
    
    private fun saveCallData(callerId: String, callerName: String, roomName: String, livekitUrl: String, callType: String, livekitToken: String) {
        val prefs = getSharedPreferences("incoming_call", Context.MODE_PRIVATE)
        prefs.edit()
            .putString("caller_id", callerId)
            .putString("caller_name", callerName)
            .putString("room_name", roomName)
            .putString("livekit_url", livekitUrl)
            .putString("livekit_token", livekitToken)
            .putString("call_type", callType)
            .putLong("timestamp", System.currentTimeMillis())
            .apply()
        Log.d(TAG, "📞 Call data saved to SharedPreferences (with token)")
    }
    
    private fun isAppInForeground(): Boolean {
        val activityManager = getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
        val appProcesses = activityManager.runningAppProcesses ?: return false
        val packageName = packageName
        for (appProcess in appProcesses) {
            if (appProcess.importance == android.app.ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
                && appProcess.processName == packageName) {
                return true
            }
        }
        return false
    }

    private fun showIncomingCallNotification(
        callerId: String,
        callerName: String,
        roomName: String,
        livekitUrl: String,
        callType: String = "voice"
    ) {
        // IncomingCallActivity로 전체화면 Intent (잠금화면 위에 표시)
        val fullScreenIntent = Intent(this, IncomingCallActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or 
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS or
                    Intent.FLAG_ACTIVITY_NO_USER_ACTION
            putExtra("caller_id", callerId)
            putExtra("caller_name", callerName)
            putExtra("room_name", roomName)
            putExtra("livekit_url", livekitUrl)
            putExtra("call_type", callType)
        }
        
        val fullScreenPendingIntent = PendingIntent.getActivity(
            this,
            System.currentTimeMillis().toInt(), // 고유한 requestCode
            fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE // FLAG_MUTABLE로 변경
        )
        
        // 수락 Intent (알림에서 직접 수락)
        val acceptIntent = Intent(this, MainActivity::class.java).apply {
            action = "ACCEPT_CALL"
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("type", "accept_call")
            putExtra("caller_id", callerId)
            putExtra("caller_name", callerName)
            putExtra("room_name", roomName)
            putExtra("livekit_url", livekitUrl)
            putExtra("call_type", callType)
        }
        
        val acceptPendingIntent = PendingIntent.getActivity(
            this,
            System.currentTimeMillis().toInt() + 1,
            acceptIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        )
        
        // 거절 Intent
        val declineIntent = Intent(this, CallActionReceiver::class.java).apply {
            action = "DECLINE_CALL"
            putExtra("room_name", roomName)
            putExtra("caller_id", callerId)
        }
        
        val declinePendingIntent = PendingIntent.getBroadcast(
            this,
            System.currentTimeMillis().toInt() + 2,
            declineIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        )
        
        // Android 12+ (API 31): CallStyle 사용 - 카카오톡처럼 초록/빨간 버튼
        val notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val caller = Person.Builder()
                .setName(callerName)
                .setImportant(true)
                .build()
            
            Notification.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_menu_call)
                .setContentIntent(fullScreenPendingIntent)
                .setFullScreenIntent(fullScreenPendingIntent, true)
                .setStyle(
                    Notification.CallStyle.forIncomingCall(
                        caller,
                        declinePendingIntent,  // 빨간색 거절 버튼
                        acceptPendingIntent    // 초록색 수락 버튼
                    )
                )
                .setCategory(Notification.CATEGORY_CALL)
                .setAutoCancel(false)
                .setOngoing(true)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .build()
        } else {
            // Android 11 이하: 기존 방식
            val callerCompat = PersonCompat.Builder()
                .setName(callerName)
                .setImportant(true)
                .build()
            
            NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_menu_call)
                .setContentTitle("📞 수신 통화")
                .setContentText("$callerName 님의 전화")
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setAutoCancel(false)
                .setOngoing(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setFullScreenIntent(fullScreenPendingIntent, true)
                .addAction(
                    android.R.drawable.sym_action_call,
                    "",
                    acceptPendingIntent
                )
                .addAction(
                    android.R.drawable.ic_menu_close_clear_cancel,
                    "",
                    declinePendingIntent
                )
                .build()
        }
        
        notification.flags = notification.flags or Notification.FLAG_INSISTENT or Notification.FLAG_NO_CLEAR
        
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        
        // Android 14+ (API 34) fullScreenIntent 권한 체크
        val canFullScreen = if (Build.VERSION.SDK_INT >= 34) {
            notificationManager.canUseFullScreenIntent()
        } else {
            true
        }
        Log.d(TAG, "📞 Can use fullScreenIntent: $canFullScreen")
        
        if (!canFullScreen) {
            Log.w(TAG, "⚠️ fullScreenIntent PERMISSION DENIED! 설정에서 '전체 화면 알림 표시' 허용 필요!")
        }
        
        // 알림 표시 - fullScreenIntent가 화면 OFF/잠금 상태에서 자동으로 Activity 시작
        notificationManager.notify(NOTIFICATION_ID, notification)
        Log.d(TAG, "📞 Notification shown with fullScreenIntent")
        
        // 화면 상태 확인
        val powerManager = getSystemService(Context.POWER_SERVICE) as android.os.PowerManager
        val isScreenOn = powerManager.isInteractive
        val keyguardManager = getSystemService(Context.KEYGUARD_SERVICE) as android.app.KeyguardManager
        val isLocked = keyguardManager.isKeyguardLocked
        Log.d(TAG, "📞 Screen: ${if (isScreenOn) "ON" else "OFF"}, Locked: $isLocked")
        
        // fullScreenIntent 동작:
        // - 화면 OFF 또는 잠금 상태 → 시스템이 IncomingCallActivity 자동 시작
        // - 화면 ON + 잠금해제 → heads-up notification만 표시
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            
            // 이미 채널이 있으면 재생성하지 않음 (사용자 설정 유지)
            if (notificationManager.getNotificationChannel(CHANNEL_ID) != null) {
                Log.d(TAG, "✅ Notification channel already exists")
                return
            }
            
            val importance = NotificationManager.IMPORTANCE_HIGH
            val channel = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, importance).apply {
                description = "수신 통화 알림"
                setShowBadge(true)
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 1000, 500, 1000, 500, 1000)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                setBypassDnd(true)
                
                val audioAttributes = AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .build()
                setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE), audioAttributes)
            }
            
            notificationManager.createNotificationChannel(channel)
            Log.d(TAG, "✅ Notification channel created with bypassDnd=true")
        }
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "🔑 New FCM token: $token")
    }
}

