package com.mateyou.app;

import android.Manifest;
import android.content.ComponentName;
import android.content.Context;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.telecom.Connection;
import android.telecom.ConnectionRequest;
import android.telecom.ConnectionService;
import android.telecom.PhoneAccount;
import android.telecom.PhoneAccountHandle;
import android.telecom.TelecomManager;
import android.telecom.VideoProfile;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;

import java.util.HashMap;
import java.util.Map;
import java.util.function.BiConsumer;
import java.util.function.Consumer;

public class CallManager {
    private static final String TAG = "CallManager";
    private static final String PHONE_ACCOUNT_ID = "mateyou_voip";
    
    private final Context context;
    private final TelecomManager telecomManager;
    private final PhoneAccountHandle phoneAccountHandle;
    
    private Consumer<String> onCallAnswered;
    private BiConsumer<String, String> onCallEnded;
    
    private static final Map<String, MateYouConnection> activeConnections = new HashMap<>();
    private static Context appContext; // 앱 컨텍스트 저장용
    
    public CallManager(Context context) {
        this.context = context;
        appContext = context.getApplicationContext(); // 저장
        this.telecomManager = (TelecomManager) context.getSystemService(Context.TELECOM_SERVICE);
        
        // Create phone account handle
        ComponentName componentName = new ComponentName(context, MateYouConnectionService.class);
        phoneAccountHandle = new PhoneAccountHandle(componentName, PHONE_ACCOUNT_ID);
        
        // Register phone account
        registerPhoneAccount();
    }
    
    public void setOnCallAnswered(Consumer<String> callback) {
        this.onCallAnswered = callback;
    }
    
    public void setOnCallEnded(BiConsumer<String, String> callback) {
        this.onCallEnded = callback;
    }
    
    private void registerPhoneAccount() {
        PhoneAccount.Builder builder = PhoneAccount.builder(phoneAccountHandle, "메이트유")
            .setCapabilities(PhoneAccount.CAPABILITY_CALL_PROVIDER 
                | PhoneAccount.CAPABILITY_CONNECTION_MANAGER
                | PhoneAccount.CAPABILITY_SELF_MANAGED);
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder.setCapabilities(PhoneAccount.CAPABILITY_SELF_MANAGED);
        }
        
        PhoneAccount phoneAccount = builder.build();
        telecomManager.registerPhoneAccount(phoneAccount);
    }
    
    public boolean startOutgoingCall(String callUUID, String callerName) {
        if (ActivityCompat.checkSelfPermission(context, Manifest.permission.MANAGE_OWN_CALLS) 
                != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "MANAGE_OWN_CALLS permission not granted");
            return false;
        }
        
        try {
            Bundle extras = new Bundle();
            extras.putString("callUUID", callUUID);
            extras.putString("callerName", callerName);
            extras.putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, phoneAccountHandle);
            
            Uri uri = Uri.fromParts("tel", callerName, null);
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                telecomManager.placeCall(uri, extras);
            }
            
            // Create and track connection
            MateYouConnection connection = new MateYouConnection(callUUID, callerName, true);
            connection.setOnDisconnected(reason -> {
                if (onCallEnded != null) {
                    onCallEnded.accept(callUUID, reason);
                }
                activeConnections.remove(callUUID);
            });
            activeConnections.put(callUUID, connection);
            
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Failed to start outgoing call", e);
            return false;
        }
    }
    
    public void reportOutgoingCallConnected(String callUUID) {
        MateYouConnection connection = activeConnections.get(callUUID);
        if (connection != null) {
            connection.setActive();
        }
    }
    
    public boolean reportIncomingCall(String callUUID, String callerName) {
        if (ActivityCompat.checkSelfPermission(context, Manifest.permission.MANAGE_OWN_CALLS) 
                != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "MANAGE_OWN_CALLS permission not granted");
            return false;
        }
        
        try {
            Bundle extras = new Bundle();
            extras.putString("callUUID", callUUID);
            extras.putString("callerName", callerName);
            extras.putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, phoneAccountHandle);
            
            Uri uri = Uri.fromParts("tel", callerName, null);
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                telecomManager.addNewIncomingCall(phoneAccountHandle, extras);
            }
            
            // Create and track connection
            MateYouConnection connection = new MateYouConnection(callUUID, callerName, false);
            connection.setOnAnswered(() -> {
                if (onCallAnswered != null) {
                    onCallAnswered.accept(callUUID);
                }
            });
            connection.setOnDisconnected(reason -> {
                if (onCallEnded != null) {
                    onCallEnded.accept(callUUID, reason);
                }
                activeConnections.remove(callUUID);
            });
            activeConnections.put(callUUID, connection);
            
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Failed to report incoming call", e);
            return false;
        }
    }
    
    public void endCall(String callUUID) {
        MateYouConnection connection = activeConnections.get(callUUID);
        if (connection != null) {
            connection.setDisconnected(new android.telecom.DisconnectCause(
                android.telecom.DisconnectCause.LOCAL
            ));
            connection.destroy();
            activeConnections.remove(callUUID);
        }
    }
    
    static MateYouConnection getConnection(String callUUID) {
        return activeConnections.get(callUUID);
    }
    
    // Inner class for Connection
    public static class MateYouConnection extends Connection {
        private final String callUUID;
        private final String callerName;
        private final boolean isOutgoing;
        
        private Runnable onAnswered;
        private Consumer<String> onDisconnected;
        
        public MateYouConnection(String callUUID, String callerName, boolean isOutgoing) {
            this.callUUID = callUUID;
            this.callerName = callerName;
            this.isOutgoing = isOutgoing;
            
            setConnectionCapabilities(
                CAPABILITY_MUTE | 
                CAPABILITY_SUPPORT_HOLD
            );
            
            setAudioModeIsVoip(true);
            
            if (isOutgoing) {
                setDialing();
            } else {
                setRinging();
            }
        }
        
        public void setOnAnswered(Runnable callback) {
            this.onAnswered = callback;
        }
        
        public void setOnDisconnected(Consumer<String> callback) {
            this.onDisconnected = callback;
        }
        
        @Override
        public void onAnswer() {
            Log.d(TAG, "📞 onAnswer called - opening app");
            setActive();
            
            // 통화 수락 시 앱 열기
            if (appContext != null) {
                try {
                    // SharedPreferences에서 통화 데이터 읽기
                    android.content.SharedPreferences prefs = appContext.getSharedPreferences("incoming_call", Context.MODE_PRIVATE);
                    String callerId = prefs.getString("caller_id", "");
                    String callerNameFromPrefs = prefs.getString("caller_name", "");
                    String roomName = prefs.getString("room_name", "");
                    String livekitUrl = prefs.getString("livekit_url", "");
                    String callType = prefs.getString("call_type", "voice");
                    
                    Log.d(TAG, "📞 Opening MainActivity with call data: " + roomName);
                    
                    android.content.Intent intent = new android.content.Intent(appContext, MainActivity.class);
                    intent.setAction(android.content.Intent.ACTION_VIEW);
                    intent.setFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK | android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP);
                    intent.putExtra("type", "accept_call");
                    intent.putExtra("caller_id", callerId);
                    intent.putExtra("caller_name", callerNameFromPrefs);
                    intent.putExtra("room_name", roomName);
                    intent.putExtra("livekit_url", livekitUrl);
                    intent.putExtra("call_type", callType);
                    appContext.startActivity(intent);
                } catch (Exception e) {
                    Log.e(TAG, "❌ Failed to open app on answer", e);
                }
            }
            
            if (onAnswered != null) {
                onAnswered.run();
            }
        }
        
        @Override
        public void onReject() {
            setDisconnected(new android.telecom.DisconnectCause(
                android.telecom.DisconnectCause.REJECTED
            ));
            if (onDisconnected != null) {
                onDisconnected.accept("rejected");
            }
            destroy();
        }
        
        @Override
        public void onDisconnect() {
            setDisconnected(new android.telecom.DisconnectCause(
                android.telecom.DisconnectCause.LOCAL
            ));
            if (onDisconnected != null) {
                onDisconnected.accept("local");
            }
            destroy();
        }
        
        @Override
        public void onAbort() {
            setDisconnected(new android.telecom.DisconnectCause(
                android.telecom.DisconnectCause.CANCELED
            ));
            if (onDisconnected != null) {
                onDisconnected.accept("aborted");
            }
            destroy();
        }
    }
}

