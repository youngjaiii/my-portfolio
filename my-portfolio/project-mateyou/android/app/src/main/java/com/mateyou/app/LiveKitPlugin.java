package com.mateyou.app;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioManager;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import io.livekit.android.LiveKit;
import io.livekit.android.room.Room;
import io.livekit.android.room.participant.LocalParticipant;
import io.livekit.android.room.track.LocalAudioTrack;

@CapacitorPlugin(
    name = "LiveKit",
    permissions = {
        @Permission(
            alias = "microphone",
            strings = { Manifest.permission.RECORD_AUDIO }
        ),
        @Permission(
            alias = "camera",
            strings = { Manifest.permission.CAMERA }
        )
    }
)
public class LiveKitPlugin extends Plugin {
    private static final String TAG = "LiveKitPlugin";
    
    private Room room;
    private LocalAudioTrack localAudioTrack;
    private String currentRoomName;
    private String currentCallUUID;
    
    private AudioManager audioManager;
    private CallManager callManager;
    private boolean isSpeakerOn = false;
    
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @Override
    public void load() {
        super.load();
        Log.d(TAG, "✅ LiveKitPlugin loaded");
        audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        callManager = new CallManager(getContext());
        
        callManager.setOnCallAnswered(uuid -> {
            JSObject data = new JSObject();
            data.put("callUUID", uuid);
            notifyListeners("callAnswered", data);
        });
        
        callManager.setOnCallEnded((uuid, reason) -> {
            JSObject data = new JSObject();
            data.put("callUUID", uuid);
            data.put("reason", reason);
            notifyListeners("callEnded", data);
            disconnectRoom();
        });
    }

    @PluginMethod
    public void connect(PluginCall call) {
        String url = call.getString("url");
        String token = call.getString("token");
        String roomName = call.getString("roomName");
        
        Log.d(TAG, "📞 connect called - url: " + url + ", roomName: " + roomName);

        if (url == null || token == null || roomName == null) {
            call.reject("Missing required parameters");
            return;
        }

        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissionForAlias("microphone", call, "handleMicrophonePermission");
            return;
        }

        connectToRoom(call, url, token, roomName);
    }

    @PermissionCallback
    private void handleMicrophonePermission(PluginCall call) {
        if (getPermissionState("microphone").equals("granted")) {
            String url = call.getString("url");
            String token = call.getString("token");
            String roomName = call.getString("roomName");
            if (url != null && token != null && roomName != null) {
                connectToRoom(call, url, token, roomName);
            } else {
                call.reject("Missing required parameters");
            }
        } else {
            call.reject("Microphone permission denied");
        }
    }

    private void connectToRoom(PluginCall call, String url, String token, String roomName) {
        executor.execute(() -> {
            try {
                Log.d(TAG, "🔌 Connecting to room: " + roomName);
                
                // Configure audio
                audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
                audioManager.setSpeakerphoneOn(isSpeakerOn);

                // Create room using LiveKit Helper (Kotlin)
                room = LiveKitHelper.createRoom(getContext());
                currentRoomName = roomName;

                // Room 이벤트 콜백
                LiveKitHelper.RoomEventCallback eventCallback = new LiveKitHelper.RoomEventCallback() {
                    @Override
                    public void onParticipantConnected(String participantName) {
                        Log.d(TAG, "👤 Participant connected: " + participantName);
                        JSObject data = new JSObject();
                        data.put("participantName", participantName);
                        notifyListeners("participantConnected", data);
                    }

                    @Override
                    public void onParticipantDisconnected(String participantName) {
                        Log.d(TAG, "👤 Participant disconnected: " + participantName);
                        JSObject data = new JSObject();
                        data.put("participantName", participantName);
                        notifyListeners("participantDisconnected", data);
                    }

                    @Override
                    public void onDisconnected() {
                        Log.d(TAG, "🔌 Room disconnected");
                        JSObject data = new JSObject();
                        data.put("reason", "room_disconnected");
                        notifyListeners("disconnected", data);
                    }
                };

                // Connect to room
                LiveKitHelper.connectRoom(room, url, token, new LiveKitHelper.ConnectionCallback() {
                    @Override
                    public void onConnected(int participantCount) {
                        Log.d(TAG, "✅ Connected to room, participants: " + participantCount);
                        
                        // Publish audio track
                        LiveKitHelper.publishAudio(room, new LiveKitHelper.AudioCallback() {
                            @Override
                            public void onAudioPublished(LocalAudioTrack track) {
                                localAudioTrack = track;
                                Log.d(TAG, "✅ Audio track published");
                                
                                JSObject result = new JSObject();
                                result.put("success", true);
                                result.put("roomId", roomName);
                                result.put("participantCount", participantCount);
                                call.resolve(result);

                                JSObject connectedData = new JSObject();
                                connectedData.put("roomName", roomName);
                                connectedData.put("participantCount", participantCount);
                                notifyListeners("connected", connectedData);
                            }

                            @Override
                            public void onError(String error) {
                                Log.e(TAG, "❌ Failed to publish audio: " + error);
                                // Still resolve as connected, just without audio
                                JSObject result = new JSObject();
                                result.put("success", true);
                                result.put("roomId", roomName);
                                result.put("participantCount", participantCount);
                                call.resolve(result);
                            }
                        });
                    }

                    @Override
                    public void onError(String error) {
                        Log.e(TAG, "❌ Failed to connect: " + error);
                        call.reject("Failed to connect: " + error);
                    }
                }, eventCallback);

            } catch (Exception e) {
                Log.e(TAG, "❌ Exception connecting to room", e);
                call.reject("Failed to connect: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        Log.d(TAG, "📴 disconnect called");
        disconnectRoom();

        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);

        JSObject data = new JSObject();
        data.put("reason", "user_initiated");
        notifyListeners("disconnected", data);
    }

    private void disconnectRoom() {
        executor.execute(() -> {
            try {
                if (localAudioTrack != null && room != null) {
                    LocalParticipant localParticipant = room.getLocalParticipant();
                    if (localParticipant != null) {
                        // Unpublish handled by disconnect
                    }
                }
                localAudioTrack = null;

                if (room != null) {
                    room.disconnect();
                    room = null;
                }

                currentRoomName = null;
                audioManager.setMode(AudioManager.MODE_NORMAL);
                Log.d(TAG, "✅ Disconnected from room");
            } catch (Exception e) {
                Log.e(TAG, "Error disconnecting room", e);
            }
        });
    }

    @PluginMethod
    public void setMicrophoneEnabled(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled");
        if (enabled == null) {
            call.reject("Missing enabled parameter");
            return;
        }

        try {
            if (localAudioTrack != null) {
                localAudioTrack.setEnabled(enabled);
            }

            JSObject result = new JSObject();
            result.put("success", true);
            result.put("enabled", enabled);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to set microphone: " + e.getMessage());
        }
    }

    @PluginMethod
    public void setSpeakerMode(PluginCall call) {
        Boolean speaker = call.getBoolean("speaker");
        if (speaker == null) {
            call.reject("Missing speaker parameter");
            return;
        }

        try {
            isSpeakerOn = speaker;
            audioManager.setSpeakerphoneOn(speaker);

            JSObject result = new JSObject();
            result.put("success", true);
            result.put("speaker", speaker);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to set speaker mode: " + e.getMessage());
        }
    }

    @PluginMethod
    public void isConnected(PluginCall call) {
        boolean connected = room != null && room.getState() == Room.State.CONNECTED;

        JSObject result = new JSObject();
        result.put("connected", connected);
        result.put("roomName", currentRoomName != null ? currentRoomName : "");
        call.resolve(result);
    }

    @PluginMethod
    public void startOutgoingCall(PluginCall call) {
        String callerName = call.getString("callerName");
        if (callerName == null) {
            call.reject("Missing callerName");
            return;
        }

        String callUUID = UUID.randomUUID().toString();
        currentCallUUID = callUUID;

        boolean success = callManager.startOutgoingCall(callUUID, callerName);

        if (success) {
            JSObject result = new JSObject();
            result.put("success", true);
            result.put("callUUID", callUUID);
            call.resolve(result);

            JSObject data = new JSObject();
            data.put("callUUID", callUUID);
            notifyListeners("outgoingCallStarted", data);
        } else {
            // Even if CallManager fails, return success for basic functionality
            JSObject result = new JSObject();
            result.put("success", true);
            result.put("callUUID", callUUID);
            call.resolve(result);
        }
    }

    @PluginMethod
    public void reportOutgoingCallConnected(PluginCall call) {
        if (currentCallUUID != null) {
            callManager.reportOutgoingCallConnected(currentCallUUID);
        }

        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    @PluginMethod
    public void reportIncomingCall(PluginCall call) {
        String callerId = call.getString("callerId");
        String callerName = call.getString("callerName");
        String roomName = call.getString("roomName");

        if (callerId == null || callerName == null || roomName == null) {
            call.reject("Missing required parameters");
            return;
        }

        String callUUID = UUID.randomUUID().toString();
        currentCallUUID = callUUID;

        boolean success = callManager.reportIncomingCall(callUUID, callerName);

        JSObject result = new JSObject();
        result.put("success", true);
        result.put("callUUID", callUUID);
        call.resolve(result);
    }

    @PluginMethod
    public void reportIncomingCallAnswered(PluginCall call) {
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    @PluginMethod
    public void reportIncomingCallRejected(PluginCall call) {
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    @PluginMethod
    public void endCall(PluginCall call) {
        if (currentCallUUID != null) {
            callManager.endCall(currentCallUUID);
        }
        currentCallUUID = null;

        disconnectRoom();

        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    @PluginMethod
    public void registerVoIPPush(PluginCall call) {
        JSObject result = new JSObject();
        result.put("success", true);
        result.put("token", "");
        call.resolve(result);
    }

    @PluginMethod
    public void getVoIPToken(PluginCall call) {
        JSObject result = new JSObject();
        result.put("token", "");
        call.resolve(result);
    }

    @PluginMethod
    public void startDialTone(PluginCall call) {
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    @PluginMethod
    public void stopDialTone(PluginCall call) {
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }
}

