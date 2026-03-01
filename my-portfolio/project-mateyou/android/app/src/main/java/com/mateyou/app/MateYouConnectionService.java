package com.mateyou.app;

import android.telecom.Connection;
import android.telecom.ConnectionRequest;
import android.telecom.ConnectionService;
import android.telecom.PhoneAccountHandle;
import android.telecom.TelecomManager;
import android.util.Log;

public class MateYouConnectionService extends ConnectionService {
    private static final String TAG = "MateYouConnectionService";
    
    @Override
    public Connection onCreateIncomingConnection(PhoneAccountHandle connectionManagerPhoneAccount, ConnectionRequest request) {
        Log.d(TAG, "onCreateIncomingConnection");
        
        String callUUID = request.getExtras().getString("callUUID");
        String callerName = request.getExtras().getString("callerName");
        
        if (callUUID != null) {
            CallManager.MateYouConnection connection = CallManager.getConnection(callUUID);
            if (connection != null) {
                return connection;
            }
        }
        
        // Create a new connection if not found
        CallManager.MateYouConnection connection = new CallManager.MateYouConnection(
            callUUID != null ? callUUID : java.util.UUID.randomUUID().toString(),
            callerName != null ? callerName : "Unknown",
            false
        );
        
        return connection;
    }
    
    @Override
    public Connection onCreateOutgoingConnection(PhoneAccountHandle connectionManagerPhoneAccount, ConnectionRequest request) {
        Log.d(TAG, "onCreateOutgoingConnection");
        
        String callUUID = request.getExtras().getString("callUUID");
        String callerName = request.getExtras().getString("callerName");
        
        if (callUUID != null) {
            CallManager.MateYouConnection connection = CallManager.getConnection(callUUID);
            if (connection != null) {
                return connection;
            }
        }
        
        // Create a new connection if not found
        CallManager.MateYouConnection connection = new CallManager.MateYouConnection(
            callUUID != null ? callUUID : java.util.UUID.randomUUID().toString(),
            callerName != null ? callerName : "Unknown",
            true
        );
        
        return connection;
    }
    
    @Override
    public void onCreateIncomingConnectionFailed(PhoneAccountHandle connectionManagerPhoneAccount, ConnectionRequest request) {
        Log.e(TAG, "onCreateIncomingConnectionFailed");
    }
    
    @Override
    public void onCreateOutgoingConnectionFailed(PhoneAccountHandle connectionManagerPhoneAccount, ConnectionRequest request) {
        Log.e(TAG, "onCreateOutgoingConnectionFailed");
    }
}





