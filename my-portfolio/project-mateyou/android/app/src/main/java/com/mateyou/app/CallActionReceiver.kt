package com.mateyou.app

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class CallActionReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "CallActionReceiver"
        private const val NOTIFICATION_ID = 1001
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        Log.d(TAG, "📞 Call action received: $action")

        when (action) {
            "DECLINE_CALL" -> {
                val roomName = intent.getStringExtra("room_name")
                Log.d(TAG, "📞 Declining call for room: $roomName")
                
                // 알림 취소
                val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                notificationManager.cancel(NOTIFICATION_ID)
                
                // TODO: 서버에 거절 알림 전송
            }
        }
    }
}





