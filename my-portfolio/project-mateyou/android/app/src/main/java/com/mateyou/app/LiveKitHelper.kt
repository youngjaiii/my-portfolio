package com.mateyou.app

import android.content.Context
import android.util.Log
import io.livekit.android.LiveKit
import io.livekit.android.events.RoomEvent
import io.livekit.android.events.collect
import io.livekit.android.room.Room
import io.livekit.android.room.participant.RemoteParticipant
import io.livekit.android.room.track.LocalAudioTrack
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

object LiveKitHelper {
    private const val TAG = "LiveKitHelper"
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    @JvmStatic
    fun createRoom(context: Context): Room {
        Log.d(TAG, "🏠 Creating LiveKit room...")
        return LiveKit.create(context)
    }

    interface ConnectionCallback {
        fun onConnected(participantCount: Int)
        fun onError(error: String)
    }

    interface RoomEventCallback {
        fun onParticipantConnected(participantName: String)
        fun onParticipantDisconnected(participantName: String)
        fun onDisconnected()
    }

    interface AudioCallback {
        fun onAudioPublished(track: LocalAudioTrack?)
        fun onError(error: String)
    }

    @JvmStatic
    fun connectRoom(room: Room, url: String, token: String, callback: ConnectionCallback, eventCallback: RoomEventCallback?) {
        scope.launch {
            try {
                Log.d(TAG, "🔌 Connecting to LiveKit room...")
                room.connect(url, token)
                
                val participantCount = room.remoteParticipants.size
                Log.d(TAG, "✅ Connected to LiveKit room, remote participants: $participantCount")
                
                // Room 이벤트 리스너 등록
                if (eventCallback != null) {
                    launch {
                        room.events.collect { event ->
                            when (event) {
                                is RoomEvent.ParticipantConnected -> {
                                    val name = event.participant.name ?: event.participant.identity?.value ?: "Unknown"
                                    Log.d(TAG, "👤 Participant connected: $name")
                                    eventCallback.onParticipantConnected(name)
                                }
                                is RoomEvent.ParticipantDisconnected -> {
                                    val name = event.participant.name ?: event.participant.identity?.value ?: "Unknown"
                                    Log.d(TAG, "👤 Participant disconnected: $name")
                                    eventCallback.onParticipantDisconnected(name)
                                }
                                is RoomEvent.Disconnected -> {
                                    Log.d(TAG, "🔌 Room disconnected")
                                    eventCallback.onDisconnected()
                                }
                                else -> {}
                            }
                        }
                    }
                }
                
                callback.onConnected(participantCount)
            } catch (e: Exception) {
                Log.e(TAG, "❌ Failed to connect to room", e)
                callback.onError(e.message ?: "Unknown error")
            }
        }
    }

    @JvmStatic
    fun publishAudio(room: Room, callback: AudioCallback) {
        scope.launch {
            try {
                val localParticipant = room.localParticipant
                Log.d(TAG, "🎤 Creating audio track...")
                
                val audioTrack = localParticipant.createAudioTrack()
                localParticipant.publishAudioTrack(audioTrack)
                
                Log.d(TAG, "✅ Audio track published")
                callback.onAudioPublished(audioTrack)
            } catch (e: Exception) {
                Log.e(TAG, "❌ Failed to publish audio", e)
                callback.onError(e.message ?: "Unknown error")
            }
        }
    }

    @JvmStatic
    fun disconnectRoom(room: Room?) {
        scope.launch {
            try {
                room?.disconnect()
                Log.d(TAG, "✅ Disconnected from room")
            } catch (e: Exception) {
                Log.e(TAG, "❌ Error disconnecting", e)
            }
        }
    }
}

