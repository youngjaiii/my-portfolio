package com.mateyou.app;

import android.content.Context;
import android.media.AudioManager;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AudioToggle")
public class AudioTogglePlugin extends Plugin {
    private static final String TAG = "AudioToggle";
    private AudioManager audioManager;

    @Override
    public void load() {
        audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        Log.d(TAG, "AudioToggle plugin loaded");
    }

    /**
     * 스피커폰 모드로 전환
     */
    @PluginMethod
    public void setSpeakerOn(PluginCall call) {
        try {
            if (audioManager == null) {
                call.reject("AudioManager not available");
                return;
            }

            // 통화 모드로 설정
            audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
            // 스피커폰 ON
            audioManager.setSpeakerphoneOn(true);

            Log.d(TAG, "Speaker ON - Mode: " + audioManager.getMode() + ", SpeakerOn: " + audioManager.isSpeakerphoneOn());

            JSObject result = new JSObject();
            result.put("success", true);
            result.put("isSpeakerOn", true);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Error setting speaker on", e);
            call.reject("Failed to set speaker on: " + e.getMessage());
        }
    }

    /**
     * 이어피스(귀대고) 모드로 전환
     */
    @PluginMethod
    public void setEarpieceOn(PluginCall call) {
        try {
            if (audioManager == null) {
                call.reject("AudioManager not available");
                return;
            }

            // 통화 모드로 설정
            audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
            // 스피커폰 OFF (이어피스로 전환)
            audioManager.setSpeakerphoneOn(false);

            Log.d(TAG, "Earpiece ON - Mode: " + audioManager.getMode() + ", SpeakerOn: " + audioManager.isSpeakerphoneOn());

            JSObject result = new JSObject();
            result.put("success", true);
            result.put("isSpeakerOn", false);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Error setting earpiece on", e);
            call.reject("Failed to set earpiece on: " + e.getMessage());
        }
    }

    /**
     * 현재 스피커 상태 확인
     */
    @PluginMethod
    public void isSpeakerOn(PluginCall call) {
        try {
            if (audioManager == null) {
                call.reject("AudioManager not available");
                return;
            }

            boolean isSpeakerOn = audioManager.isSpeakerphoneOn();

            JSObject result = new JSObject();
            result.put("isSpeakerOn", isSpeakerOn);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Error getting speaker status", e);
            call.reject("Failed to get speaker status: " + e.getMessage());
        }
    }

    /**
     * 볼륨 설정 (0.0 ~ 1.0)
     */
    @PluginMethod
    public void setVolume(PluginCall call) {
        try {
            if (audioManager == null) {
                call.reject("AudioManager not available");
                return;
            }

            float volume = call.getFloat("volume", 1.0f);
            int streamType = AudioManager.STREAM_VOICE_CALL;
            
            int maxVolume = audioManager.getStreamMaxVolume(streamType);
            int targetVolume = Math.round(volume * maxVolume);
            
            audioManager.setStreamVolume(streamType, targetVolume, 0);

            Log.d(TAG, "Volume set to: " + targetVolume + "/" + maxVolume + " (" + volume + ")");

            JSObject result = new JSObject();
            result.put("success", true);
            result.put("volume", volume);
            result.put("actualVolume", targetVolume);
            result.put("maxVolume", maxVolume);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Error setting volume", e);
            call.reject("Failed to set volume: " + e.getMessage());
        }
    }

    /**
     * 현재 볼륨 가져오기
     */
    @PluginMethod
    public void getVolume(PluginCall call) {
        try {
            if (audioManager == null) {
                call.reject("AudioManager not available");
                return;
            }

            int streamType = AudioManager.STREAM_VOICE_CALL;
            int currentVolume = audioManager.getStreamVolume(streamType);
            int maxVolume = audioManager.getStreamMaxVolume(streamType);
            float volume = (float) currentVolume / maxVolume;

            JSObject result = new JSObject();
            result.put("volume", volume);
            result.put("currentVolume", currentVolume);
            result.put("maxVolume", maxVolume);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Error getting volume", e);
            call.reject("Failed to get volume: " + e.getMessage());
        }
    }

    /**
     * 오디오 모드 리셋 (통화 종료시)
     */
    @PluginMethod
    public void resetAudioMode(PluginCall call) {
        try {
            if (audioManager == null) {
                call.reject("AudioManager not available");
                return;
            }

            // 일반 모드로 복귀
            audioManager.setMode(AudioManager.MODE_NORMAL);
            audioManager.setSpeakerphoneOn(false);

            Log.d(TAG, "Audio mode reset to normal");

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Error resetting audio mode", e);
            call.reject("Failed to reset audio mode: " + e.getMessage());
        }
    }
}

