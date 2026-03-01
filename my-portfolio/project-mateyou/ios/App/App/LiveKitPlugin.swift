import Foundation
import Capacitor
import UIKit
import CallKit
import AVFoundation
import PushKit
import LiveKitClient
import LocalAuthentication

// MARK: - IncomingCallManager
class IncomingCallManager: NSObject {
    static let shared = IncomingCallManager()
    
    private var voipRegistry: PKPushRegistry?
    private(set) var voipToken: String?
    private(set) var pendingCallInfo: [String: Any]?
    var currentCallUUID: UUID?
    
    // 최근 종료된 통화 정보 (cancel 푸시 처리용)
    private var lastEndedCallUUID: UUID?
    private var lastEndedCallTime: Date?
    
    // VoIP 푸시가 왔을 때 잠금 화면이었는지 여부
    var wasCalledFromLockScreen: Bool = false
    
    var onVoIPTokenReceived: ((String) -> Void)?
    var onIncomingCallReceived: (([String: Any]) -> Void)?
    var onCallAnswered: ((UUID, [String: Any]?) -> Void)?
    var onCallEnded: ((UUID, String) -> Void)?
    
    private override init() {
        super.init()
    }
    
    func registerForVoIPPush() {
        let registry = PKPushRegistry(queue: .main)
        registry.delegate = self
        registry.desiredPushTypes = [.voIP]
        self.voipRegistry = registry
        print("📱 [IncomingCallManager] VoIP push registry initialized")
    }
    
    func savePendingCallInfo(_ info: [String: Any]) {
        pendingCallInfo = info
        
        let defaults = UserDefaults.standard
        defaults.set(info["callerId"] as? String ?? "", forKey: "pending_caller_id")
        defaults.set(info["callerName"] as? String ?? "", forKey: "pending_caller_name")
        defaults.set(info["roomName"] as? String ?? "", forKey: "pending_room_name")
        defaults.set(info["livekitUrl"] as? String ?? "", forKey: "pending_livekit_url")
        defaults.set(info["livekitToken"] as? String ?? "", forKey: "pending_livekit_token")
        defaults.set(info["callType"] as? String ?? "voice", forKey: "pending_call_type")
        defaults.synchronize()
        
        print("📞 [IncomingCallManager] Pending call info saved")
    }
    
    func clearPendingCallInfo() {
        pendingCallInfo = nil
        wasCalledFromLockScreen = false  // 리셋
        
        let defaults = UserDefaults.standard
        defaults.removeObject(forKey: "pending_caller_id")
        defaults.removeObject(forKey: "pending_caller_name")
        defaults.removeObject(forKey: "pending_room_name")
        defaults.removeObject(forKey: "pending_livekit_url")
        defaults.removeObject(forKey: "pending_livekit_token")
        defaults.removeObject(forKey: "pending_call_type")
        defaults.synchronize()
        
        print("📞 [IncomingCallManager] Pending call info cleared")
    }
    
    // 통화 종료 시 호출 - cancel 푸시 처리용
    func markCallEnded(uuid: UUID) {
        lastEndedCallUUID = uuid
        lastEndedCallTime = Date()
        print("📴 [IncomingCallManager] Call ended, UUID saved for cancel handling: \(uuid.uuidString)")
    }
    
    // 최근 종료된 통화인지 확인 (10초 이내)
    func isRecentlyEndedCall() -> UUID? {
        guard let uuid = lastEndedCallUUID,
              let time = lastEndedCallTime,
              Date().timeIntervalSince(time) < 10 else {
            return nil
        }
        return uuid
    }
    
    func clearLastEndedCall() {
        lastEndedCallUUID = nil
        lastEndedCallTime = nil
    }
    
    func getPendingCallInfo() -> [String: Any]? {
        if let info = pendingCallInfo {
            return info
        }
        
        let defaults = UserDefaults.standard
        let callerId = defaults.string(forKey: "pending_caller_id") ?? ""
        let callerName = defaults.string(forKey: "pending_caller_name") ?? ""
        let roomName = defaults.string(forKey: "pending_room_name") ?? ""
        let livekitUrl = defaults.string(forKey: "pending_livekit_url") ?? ""
        let livekitToken = defaults.string(forKey: "pending_livekit_token") ?? ""
        let callType = defaults.string(forKey: "pending_call_type") ?? "voice"
        
        if !roomName.isEmpty && !livekitToken.isEmpty {
            return [
                "callerId": callerId,
                "callerName": callerName,
                "roomName": roomName,
                "livekitUrl": livekitUrl,
                "livekitToken": livekitToken,
                "callType": callType
            ]
        }
        
        return nil
    }
}

// MARK: - PKPushRegistryDelegate
extension IncomingCallManager: PKPushRegistryDelegate {
    
    func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
        let token = pushCredentials.token.map { String(format: "%02.2hhx", $0) }.joined()
        self.voipToken = token
        print("📱 [IncomingCallManager] VoIP token received: \(token.prefix(20))...")
        onVoIPTokenReceived?(token)
    }
    
    func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
        self.voipToken = nil
        print("📱 [IncomingCallManager] VoIP token invalidated")
    }
    
    func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {
        guard type == .voIP else {
            print("⚠️ [IncomingCallManager] Not a VoIP push, ignoring")
            completion()
            return
        }
        
        print("📞 [IncomingCallManager] ========== VoIP PUSH RECEIVED ==========")
        
        // VoIP 푸시가 왔을 때 앱 상태 확인 (잠금 화면 판단용)
        let appState = UIApplication.shared.applicationState
        let isProtectedDataAvailable = UIApplication.shared.isProtectedDataAvailable
        
        // 앱이 active가 아니거나 보호된 데이터에 접근 불가능하면 잠금 화면
        wasCalledFromLockScreen = (appState != .active) || !isProtectedDataAvailable
        
        print("🔐 [IncomingCallManager] App state: \(appState.rawValue), isProtectedDataAvailable: \(isProtectedDataAvailable)")
        print("🔐 [IncomingCallManager] Was called from lock screen: \(wasCalledFromLockScreen)")
        
        let payloadDict = payload.dictionaryPayload
        print("📞 [IncomingCallManager] Raw payload: \(payloadDict)")
        
        let aps = payloadDict["aps"] as? [String: Any] ?? [:]
        print("📞 [IncomingCallManager] APS data: \(aps)")
        
        let callerName = aps["caller_name"] as? String ?? "Unknown"
        let callerId = aps["caller_id"] as? String ?? ""
        let roomName = aps["room_name"] as? String ?? ""
        let livekitUrl = aps["livekit_url"] as? String ?? ""
        let livekitToken = aps["livekit_token"] as? String ?? ""
        let callType = aps["call_type"] as? String ?? "voice"
        
        print("📞 [IncomingCallManager] Parsed data:")
        print("   - callerName: \(callerName)")
        print("   - callerId: \(callerId)")
        print("   - roomName: \(roomName)")
        print("   - callType: \(callType)")
        print("   - livekitUrl: \(livekitUrl.prefix(50))...")
        print("   - livekitToken: \(livekitToken.prefix(50))...")
        
        // 통화 취소 푸시인 경우
        // 주의: cancel 푸시는 VoIP가 아닌 일반 APNs로 보내는 것이 권장됨
        if callType == "cancel" {
            print("📴 [IncomingCallManager] Call cancelled by caller")
            print("📴 [IncomingCallManager] currentCallUUID: \(self.currentCallUUID?.uuidString ?? "nil")")
            print("📴 [IncomingCallManager] lastEndedCallUUID: \(lastEndedCallUUID?.uuidString ?? "nil")")
            
            // 1. 기존 활성 CallKit UI가 있으면 종료
            if let uuid = self.currentCallUUID {
                print("📴 [IncomingCallManager] Ending existing CallKit with UUID: \(uuid.uuidString)")
                CallKitManager.shared.endCall(uuid: uuid)
                markCallEnded(uuid: uuid)
                self.currentCallUUID = nil
                clearPendingCallInfo()
                print("📞 [IncomingCallManager] ========== VoIP CANCEL HANDLED (existing call) ==========")
                completion()
                return
            }
            
            // 2. 최근 종료된 통화가 있으면 해당 UUID로 endCall 시도 (이미 종료됐으므로 무시됨)
            if let recentUUID = isRecentlyEndedCall() {
                print("📴 [IncomingCallManager] Recent call found, ending with UUID: \(recentUUID.uuidString)")
                CallKitManager.shared.endCall(uuid: recentUUID)
                clearPendingCallInfo()
                clearLastEndedCall()
                print("📞 [IncomingCallManager] ========== VoIP CANCEL HANDLED (recent call) ==========")
                completion()
                return
            }
            
            // 3. 활성/최근 통화 없음 - completion만 호출
            // 서버에서 cancel 푸시를 일반 APNs로 보내도록 수정 권장
            print("⚠️ [IncomingCallManager] No active/recent call for cancel push")
            print("⚠️ [IncomingCallManager] WARNING: Server should send cancel as regular APNs, not VoIP")
            clearPendingCallInfo()
            print("📞 [IncomingCallManager] ========== VoIP CANCEL HANDLED (no call) ==========")
            completion()
            return
        }
        
        let callInfo: [String: Any] = [
            "callerId": callerId,
            "callerName": callerName,
            "roomName": roomName,
            "livekitUrl": livekitUrl,
            "livekitToken": livekitToken,
            "callType": callType
        ]
        savePendingCallInfo(callInfo)
        
        let callUUID = UUID()
        self.currentCallUUID = callUUID
        
        let hasVideo = callType == "video"
        print("📞 [IncomingCallManager] Calling reportNewIncomingCall with UUID: \(callUUID.uuidString), hasVideo: \(hasVideo)")
        
        CallKitManager.shared.reportIncomingCall(uuid: callUUID, handle: callerName, callerName: callerName, hasVideo: hasVideo) { [weak self] error in
            if let error = error {
                print("❌ [IncomingCallManager] CallKit reportIncomingCall FAILED!")
                print("❌ [IncomingCallManager] Error: \(error.localizedDescription)")
                self?.clearPendingCallInfo()
            } else {
                print("✅ [IncomingCallManager] CallKit reportIncomingCall SUCCESS!")
                print("✅ [IncomingCallManager] System call UI should be visible now")
                self?.onIncomingCallReceived?(callInfo)
            }
            print("📞 [IncomingCallManager] ========== VoIP PUSH HANDLED ==========")
            completion()
        }
    }
}

// MARK: - CallKitManager
class CallKitManager: NSObject {
    static let shared = CallKitManager()
    
    private let provider: CXProvider
    private let callController = CXCallController()
    private var isCallAnswered = false // 통화 수락 여부 추적
    private var currentCallHasVideo = false // 현재 통화가 영상통화인지 여부
    private var pendingAnswerAction: CXAnswerCallAction? // 잠금 화면에서 수락 시 저장
    
    // 잠금 화면에서 수락 후 Face ID 요청 대기 중인지 여부
    var needsFaceIDOnActive: Bool = false
    var pendingCallUUID: UUID?
    var pendingCallInfo: [String: Any]?
    
    var onCallAnswered: ((UUID) -> Void)?
    var onCallEnded: ((UUID, String) -> Void)?
    var onMuteChanged: ((Bool) -> Void)?
    var onFaceIDRequired: ((UUID, [String: Any]?) -> Void)?
    
    private override init() {
        let config = CXProviderConfiguration()
        config.supportsVideo = true
        config.maximumCallsPerCallGroup = 1
        config.supportedHandleTypes = [.generic]
        config.includesCallsInRecents = true
        
        if let iconImage = UIImage(named: "AppIcon") {
            config.iconTemplateImageData = iconImage.pngData()
        }
        
        provider = CXProvider(configuration: config)
        super.init()
        provider.setDelegate(self, queue: .main)
        
        print("✅ [CallKitManager] Initialized")
    }
    
    func startOutgoingCall(uuid: UUID, handle: String, completion: @escaping (Bool) -> Void) {
        let handle = CXHandle(type: .generic, value: handle)
        let startAction = CXStartCallAction(call: uuid, handle: handle)
        startAction.isVideo = false
        
        let transaction = CXTransaction(action: startAction)
        callController.request(transaction) { error in
            if let error = error {
                print("❌ [CallKitManager] Start outgoing call failed: \(error)")
            }
            completion(error == nil)
        }
    }
    
    func reportOutgoingCallConnected(uuid: UUID) {
        provider.reportOutgoingCall(with: uuid, connectedAt: Date())
    }
    
    func reportIncomingCall(uuid: UUID, handle: String, callerName: String, hasVideo: Bool = false, completion: @escaping (Error?) -> Void) {
        print("📞 [CallKitManager] reportIncomingCall called")
        print("   - UUID: \(uuid.uuidString)")
        print("   - Handle: \(handle)")
        print("   - CallerName: \(callerName)")
        print("   - hasVideo: \(hasVideo)")
        
        // 영상통화 여부 저장 (오디오 세션 설정에 사용)
        currentCallHasVideo = hasVideo
        
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: handle)
        update.localizedCallerName = callerName
        update.hasVideo = hasVideo
        update.supportsGrouping = false
        update.supportsUngrouping = false
        update.supportsHolding = false
        
        print("📞 [CallKitManager] Calling provider.reportNewIncomingCall...")
        
        provider.reportNewIncomingCall(with: uuid, update: update) { error in
            if let error = error {
                print("❌ [CallKitManager] reportNewIncomingCall FAILED: \(error)")
            } else {
                print("✅ [CallKitManager] reportNewIncomingCall SUCCESS - UI should appear now!")
            }
            completion(error)
        }
    }
    
    func endCall(uuid: UUID) {
        print("📴 [CallKitManager] Ending call with UUID: \(uuid.uuidString)")
        
        // cancel 푸시 처리를 위해 종료된 통화 정보 저장 (reportCall은 delegate를 호출하지 않음)
        IncomingCallManager.shared.markCallEnded(uuid: uuid)
        
        // 먼저 reportCall로 통화 종료 보고 (수신 중 상태에서도 동작)
        provider.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
        
        // CXEndCallAction은 수락된 통화에서만 유효
        if isCallAnswered {
            let endAction = CXEndCallAction(call: uuid)
            let transaction = CXTransaction(action: endAction)
            callController.request(transaction) { error in
                if let error = error {
                    print("⚠️ [CallKitManager] CXEndCallAction failed: \(error)")
                } else {
                    print("✅ [CallKitManager] CXEndCallAction succeeded")
                }
            }
        }
    }
}

// MARK: - CXProviderDelegate
extension CallKitManager: CXProviderDelegate {
    func providerDidReset(_ provider: CXProvider) {
        print("📞 [CallKitManager] Provider did reset")
    }
    
    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        print("📞 [CallKitManager] Call answered")
        
        let callInfo = IncomingCallManager.shared.getPendingCallInfo()
        
        // VoIP 푸시가 왔을 때 잠금 화면이었는지 확인
        let wasFromLockScreen = IncomingCallManager.shared.wasCalledFromLockScreen
        
        print("🔐 [CallKitManager] Was called from lock screen: \(wasFromLockScreen)")
        
        // action.fulfill() 호출 - 통화 중 전환
        action.fulfill()
        isCallAnswered = true
        
        // 잠금 상태 여부와 관계없이 동일하게 처리
        // 잠금 상태면 iOS가 자동으로 암호 요청할 것
        print("📱 [CallKitManager] Opening app and connecting call...")
        navigateToCallPage()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.startCallConnection(callUUID: action.callUUID, callInfo: callInfo)
        }
    }
    
    // AppDelegate에서 호출 - 앱이 활성화되면 pending 통화 연결
    func handleAppDidBecomeActive() {
        print("📱 [CallKitManager] handleAppDidBecomeActive called")
        print("📱 [CallKitManager] needsFaceIDOnActive: \(needsFaceIDOnActive), pendingCallUUID: \(String(describing: pendingCallUUID))")
        
        // 잠금 화면에서 통화 수락 후 앱이 열렸을 때
        guard needsFaceIDOnActive, let callUUID = pendingCallUUID else {
            print("📱 [CallKitManager] No pending call to connect")
            return
        }
        
        print("✅ [CallKitManager] App is now active! Connecting call...")
        needsFaceIDOnActive = false
        
        // 이제 앱이 포그라운드이므로 /call 이동 + LiveKit 연결
        navigateToCallPage()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.startCallConnection(callUUID: callUUID, callInfo: self?.pendingCallInfo)
            self?.pendingCallInfo = nil
            self?.pendingCallUUID = nil
        }
    }
    
    private func startCallConnection(callUUID: UUID, callInfo: [String: Any]?) {
        print("🔌 [CallKitManager] Starting LiveKit connection")
        // 이제 LiveKit 연결 시작 (onCallAnswered 콜백 호출)
        // 이 콜백이 호출되면 LiveKitPlugin의 setupCallKitCallbacks()에서 LiveKit 연결 시작
        onCallAnswered?(callUUID)
        
        if let callInfo = callInfo {
            IncomingCallManager.shared.onCallAnswered?(callUUID, callInfo)
        }
    }
    
    private func navigateToCallPage() {
        // LiveKitPlugin 인스턴스에 접근하여 WebView에 JavaScript 실행
        guard let plugin = LiveKitPlugin.shared else {
            print("⚠️ [CallKitManager] LiveKitPlugin instance not found")
            return
        }
        
        let callInfo = IncomingCallManager.shared.getPendingCallInfo()
        guard let roomName = callInfo?["roomName"] as? String,
              let token = callInfo?["livekitToken"] as? String,
              let url = callInfo?["livekitUrl"] as? String,
              let callerId = callInfo?["callerId"] as? String,
              let callerName = callInfo?["callerName"] as? String else {
            print("⚠️ [CallKitManager] Missing call info for navigation")
            return
        }
        
        let callType = callInfo?["callType"] as? String ?? "voice"
        
        // JavaScript 이스케이프 처리
        let safeCallerName = callerName.replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
            .replacingOccurrences(of: "\n", with: "\\n")
        
        // 앱이 백그라운드에 있으면 포그라운드로 전환
        if UIApplication.shared.applicationState != .active {
            print("📱 [CallKitManager] App is in background, bringing to foreground")
            // CallKit이 이미 앱을 포그라운드로 전환했지만, WebView가 준비될 때까지 약간의 딜레이
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                self.executeNavigation(plugin: plugin, callerId: callerId, callerName: safeCallerName, roomName: roomName, token: token, url: url, callType: callType)
            }
        } else {
            // 앱이 이미 포그라운드에 있으면 바로 실행
            executeNavigation(plugin: plugin, callerId: callerId, callerName: safeCallerName, roomName: roomName, token: token, url: url, callType: callType)
        }
    }
    
    private func executeNavigation(plugin: LiveKitPlugin, callerId: String, callerName: String, roomName: String, token: String, url: String, callType: String) {
        // WebView에 /call로 이동하는 이벤트 전달
        let jsCode = """
            window.dispatchEvent(new CustomEvent('native-callkit-answered', {
                detail: {
                    callerId: '\(callerId)',
                    callerName: '\(callerName)',
                    roomName: '\(roomName)',
                    livekitUrl: '\(url)',
                    livekitToken: '\(token)',
                    callType: '\(callType)',
                    mode: 'incoming'
                }
            }));
        """
        
        DispatchQueue.main.async {
            if let bridge = plugin.bridge,
               let webView = bridge.webView {
                webView.evaluateJavaScript(jsCode, completionHandler: { result, error in
                    if let error = error {
                        print("❌ [CallKitManager] Failed to navigate to call page: \(error.localizedDescription)")
                        // 실패 시 재시도
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                            webView.evaluateJavaScript(jsCode, completionHandler: nil)
                        }
                    } else {
                        print("✅ [CallKitManager] Navigated to call page")
                    }
                })
            } else {
                print("⚠️ [CallKitManager] Bridge or WebView not available, retrying...")
                // WebView가 아직 준비되지 않았으면 재시도
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    self.executeNavigation(plugin: plugin, callerId: callerId, callerName: callerName, roomName: roomName, token: token, url: url, callType: callType)
                }
            }
        }
    }
    
    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        // 수락 전 종료 = 거절, 수락 후 종료 = 종료
        let reason = isCallAnswered ? "ended" : "rejected"
        print("📞 [CallKitManager] Call ended, reason: \(reason)")
        
        // cancel 푸시 처리를 위해 종료된 통화 정보 저장
        IncomingCallManager.shared.markCallEnded(uuid: action.callUUID)
        
        onCallEnded?(action.callUUID, reason)
        IncomingCallManager.shared.onCallEnded?(action.callUUID, reason)
        IncomingCallManager.shared.clearPendingCallInfo()
        isCallAnswered = false // 리셋
        currentCallHasVideo = false // 리셋
        action.fulfill()
    }
    
    func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        print("📞 [CallKitManager] Mute changed: \(action.isMuted)")
        onMuteChanged?(action.isMuted)
        action.fulfill()
    }
    
    func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
        print("📞 [CallKitManager] Start call action")
        provider.reportOutgoingCall(with: action.callUUID, startedConnectingAt: Date())
        action.fulfill()
    }
    
    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        print("🎵 [CallKitManager] Audio session activated by CallKit")
        do {
            var options: AVAudioSession.CategoryOptions = [.allowBluetooth]
            if currentCallHasVideo {
                options.insert(.defaultToSpeaker)
                print("📹 [CallKitManager] Video call detected - will use speaker mode")
            } else {
                print("📞 [CallKitManager] Voice call detected - will use earpiece mode")
            }
            try audioSession.setCategory(.playAndRecord, mode: .voiceChat, options: options)
            try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
            
            // 명시적으로 스피커/이어피스 모드 설정
            if currentCallHasVideo {
                try audioSession.overrideOutputAudioPort(.speaker)
                print("🔊 [CallKitManager] Speaker mode enabled")
            } else {
                try audioSession.overrideOutputAudioPort(.none)
                print("🔈 [CallKitManager] Earpiece mode enabled")
            }
            
            print("✅ [CallKitManager] Audio session configured for call")
        } catch {
            print("❌ [CallKitManager] Failed to configure audio session: \(error)")
        }
    }
    
    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        print("🎵 [CallKitManager] Audio session deactivated")
        do {
            try audioSession.setActive(false)
        } catch {
            print("❌ [CallKitManager] Failed to deactivate audio session: \(error)")
        }
    }
}

// MARK: - LiveKitPlugin
@objc(LiveKitPlugin)
public class LiveKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public static weak var shared: LiveKitPlugin?
    
    public let identifier = "LiveKitPlugin"
    public let jsName = "LiveKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "connect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setMicrophoneEnabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSpeakerMode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isConnected", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startOutgoingCall", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reportOutgoingCallConnected", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reportIncomingCall", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endCall", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "registerVoIPPush", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getVoIPToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startDialTone", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopDialTone", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPendingCallInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearPendingCallInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getActiveCallState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearActiveCallState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showVideoViews", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hideVideoViews", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setLocalVideoMirrored", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showVoiceCallMiniMode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hideVoiceCallMiniMode", returnType: CAPPluginReturnPromise)
    ]
    
    private var room: Room?
    private var localAudioTrack: LocalAudioTrack?
    private var localVideoTrack: LocalVideoTrack?
    private var currentRoomName: String?
    
    private var currentCallUUID: UUID?
    private var audioPlayer: AVAudioPlayer?
    private var isConnecting = false
    private var activeCallInfo: [String: Any]?
    
    // 비디오 뷰
    private var localVideoView: VideoView?
    private var remoteVideoView: VideoView?
    private var videoContainerView: UIView?
    private var miniModeButton: UIButton?
    private var expandButton: UIButton?
    private var isInMiniMode = false
    private var endCallButton: UIButton?
    private var muteButton: UIButton?
    private var speakerButton: UIButton?
    private var videoToggleButton: UIButton?
    private var cameraFlipButton: UIButton?
    private var isUsingFrontCamera = true
    private var controlContainerView: UIView?
    private var isMuted = false
    private var isSpeakerOn = true // 영상통화는 스피커 기본
    private var isVideoEnabled = true
    
    // 음성통화 미니모드 UI
    private var voiceCallFloatingView: UIView?
    private var voiceCallNameLabel: UILabel?
    private var voiceCallDurationLabel: UILabel?
    private var voiceCallExpandButton: UIButton?
    private var voiceCallEndButton: UIButton?
    private var voiceCallDurationTimer: Timer?
    private var voiceCallStartTime: Date?
    private var isVoiceCallMinimized = false
    private var currentPartnerName: String = ""
    
    // 실제 APNs 환경 감지
    private static func detectApnsEnvironment() -> String {
        // 방법 1: embedded.mobileprovision에서 읽기 (Archive/TestFlight/Ad Hoc 빌드)
        if let provisionPath = Bundle.main.path(forResource: "embedded", ofType: "mobileprovision"),
           let provisionData = FileManager.default.contents(atPath: provisionPath),
           let provisionString = String(data: provisionData, encoding: .ascii),
           let plistStart = provisionString.range(of: "<?xml"),
           let plistEnd = provisionString.range(of: "</plist>") {
            
            let plistString = String(provisionString[plistStart.lowerBound...plistEnd.upperBound])
            
            if let plistData = plistString.data(using: .utf8),
               let plist = try? PropertyListSerialization.propertyList(from: plistData, format: nil) as? [String: Any],
               let entitlements = plist["Entitlements"] as? [String: Any],
               let apsEnv = entitlements["aps-environment"] as? String {
                print("✅ [LiveKitPlugin] Detected APNs environment from provisioning: \(apsEnv)")
                return apsEnv == "production" ? "production" : "sandbox"
            }
        }
        
        // 방법 2: 앱 entitlements에서 읽기 (Xcode 직접 실행)
        if let entitlementsPath = Bundle.main.path(forResource: "App", ofType: "entitlements"),
           let entitlementsData = FileManager.default.contents(atPath: entitlementsPath),
           let plist = try? PropertyListSerialization.propertyList(from: entitlementsData, format: nil) as? [String: Any],
           let apsEnv = plist["aps-environment"] as? String {
            print("✅ [LiveKitPlugin] Detected APNs environment from entitlements: \(apsEnv)")
            return apsEnv == "production" ? "production" : "sandbox"
        }
        
        // 방법 3: 빌드 설정으로 판단
        #if DEBUG
        print("⚠️ [LiveKitPlugin] Using DEBUG flag, defaulting to sandbox")
        return "sandbox"
        #else
        print("⚠️ [LiveKitPlugin] Using RELEASE flag, defaulting to production")
        return "production"
        #endif
    }
    
    public override func load() {
        LiveKitPlugin.shared = self
        super.load()
        setupCallKitCallbacks()
        
        // VoIP 푸시 등록 (콜백 설정 후 등록해야 토큰 수신 가능)
        IncomingCallManager.shared.registerForVoIPPush()
        
        // 이미 받은 토큰이 있으면 즉시 전송
        if let existingToken = IncomingCallManager.shared.voipToken {
            let apnsEnv = Self.detectApnsEnvironment()
            print("📱 [LiveKitPlugin] Sending existing VoIP token, apnsEnv: \(apnsEnv)")
            notifyListeners("voipTokenReceived", data: ["token": existingToken, "apnsEnv": apnsEnv])
        }
        
        // UserDefaults에서 활성 통화 정보 복원
        if activeCallInfo == nil, let savedInfo = loadActiveCallInfoFromDefaults() {
            activeCallInfo = savedInfo
            print("📱 [LiveKitPlugin] Restored active call info from defaults")
        }
        
        print("📱 [LiveKitPlugin] Loaded and initialized")
    }
    
    // MARK: - LiveKit Connection
    @objc func connect(_ call: CAPPluginCall) {
        guard let url = call.getString("url"),
              let token = call.getString("token"),
              let roomName = call.getString("roomName") else {
            call.reject("Missing required parameters")
            return
        }
        
        let callType = call.getString("callType") ?? "voice"
        let isVideoCall = callType == "video"
        
        print("🔌 [LiveKitPlugin] Connecting to room: \(roomName), callType: \(callType)")
        
        Task { @MainActor in
            do {
                // 기존 Room이 있으면 먼저 정리 (중복 연결 방지)
                if self.room != nil {
                    print("⚠️ [LiveKitPlugin] Existing room found, cleaning up first")
                    await self.cleanupRoom()
                }
                
                // LiveKit AudioManager 스피커 설정 (영상통화: 스피커, 음성통화: 이어피스)
                AudioManager.shared.isSpeakerOutputPreferred = isVideoCall
                print("🔊 [LiveKitPlugin] AudioManager.isSpeakerOutputPreferred = \(isVideoCall)")
                
                // CallKit이 오디오 세션을 활성화하지 않은 경우에만 설정
                // CallKit이 활성화한 경우는 스킵하여 충돌 방지
                do {
                    try configureAudioSession(callType: callType)
                } catch {
                    print("⚠️ [LiveKitPlugin] Audio session configuration failed (may be already active): \(error)")
                    // 오디오 세션이 이미 활성화된 경우 계속 진행
                }
                
                let room = Room()
                self.room = room
                self.currentRoomName = roomName
                
                room.add(delegate: self)
                
                try await room.connect(url: url, token: token)
                
                // 오디오 트랙 발행 (마이크 입력 캡처 옵션 명시)
                let audioOptions = AudioCaptureOptions(
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: false
                )
                let audioTrack = LocalAudioTrack.createTrack(options: audioOptions)
                self.localAudioTrack = audioTrack
                print("🎤 [LiveKitPlugin] Audio track created - muted: \(audioTrack.isMuted)")
                try await room.localParticipant.publish(audioTrack: audioTrack)
                print("✅ [LiveKitPlugin] Audio track published, muted: \(audioTrack.isMuted)")
                
                // 마이크 활성화 (오디오 데이터 전송을 위해 필수)
                try await room.localParticipant.setMicrophone(enabled: true)
                print("✅ [LiveKitPlugin] Microphone enabled - audio should be transmitting")
                
                // 영상통화일 경우 비디오 트랙도 발행 (HD 화질)
                if isVideoCall {
                    print("📹 [LiveKitPlugin] Publishing video track for video call (HD)")
                    let captureOptions = CameraCaptureOptions(
                        dimensions: .h1080_169,
                        fps: 30
                    )
                    let videoTrack = LocalVideoTrack.createCameraTrack(options: captureOptions)
                    self.localVideoTrack = videoTrack
                    try await room.localParticipant.publish(videoTrack: videoTrack)
                    
                    // VideoView가 이미 있으면 연결
                    if let localView = self.localVideoView {
                        localView.track = videoTrack
                        print("📹 [LiveKitPlugin] Local video track auto-attached to view")
                    }
                    
                    // 영상통화 중 화면 자동 꺼짐 방지
                    UIApplication.shared.isIdleTimerDisabled = true
                    print("💡 [LiveKitPlugin] Idle timer disabled for video call")
                }
                
                // 스피커/이어피스 설정은 didActivate에서 처리 (CallKit이 관리)
                print("✅ [LiveKitPlugin] Connected to room: \(roomName)")
                
                call.resolve([
                    "success": true,
                    "roomId": roomName
                ])
                
                self.notifyListeners("connected", data: ["roomName": roomName])
            } catch {
                print("❌ [LiveKitPlugin] Connection failed: \(error)")
                call.reject("Failed to connect: \(error.localizedDescription)")
            }
        }
    }
    
    @objc func disconnect(_ call: CAPPluginCall) {
        print("🔌 [LiveKitPlugin] Disconnecting...")
        Task { @MainActor in
            await cleanupRoom()
            call.resolve(["success": true])
            self.notifyListeners("disconnected", data: ["reason": "user_initiated"])
        }
    }
    
    @objc func setMicrophoneEnabled(_ call: CAPPluginCall) {
        guard let enabled = call.getBool("enabled") else {
            call.reject("Missing enabled parameter")
            return
        }
        
        Task { @MainActor in
            do {
                if enabled {
                    try await room?.localParticipant.setMicrophone(enabled: true)
                } else {
                    try await room?.localParticipant.setMicrophone(enabled: false)
                }
            } catch {
                print("❌ [LiveKitPlugin] Failed to set microphone: \(error)")
            }
            call.resolve(["success": true, "enabled": enabled])
        }
    }
    
    @objc func setSpeakerMode(_ call: CAPPluginCall) {
        guard let speaker = call.getBool("speaker") else {
            call.reject("Missing speaker parameter")
            return
        }
        
        do {
            let session = AVAudioSession.sharedInstance()
            
            // LiveKit AudioManager도 업데이트 (SDK 내부 상태 동기화)
            AudioManager.shared.isSpeakerOutputPreferred = speaker
            print("🔊 [LiveKitPlugin] AudioManager.isSpeakerOutputPreferred = \(speaker)")
            
            // 오디오 세션 상태 확인
            print("📱 [LiveKitPlugin] Audio session category: \(session.category.rawValue)")
            
            // overrideOutputAudioPort로 스피커/이어피스 전환
            if speaker {
                try session.overrideOutputAudioPort(.speaker)
                print("🔊 [LiveKitPlugin] Speaker mode enabled")
            } else {
                try session.overrideOutputAudioPort(.none)
                print("🔈 [LiveKitPlugin] Earpiece mode enabled")
            }
            
            // overrideOutputAudioPort가 제대로 작동하도록 오디오 세션을 다시 활성화
            // 이미 활성화된 오디오 세션을 옵션 없이 재활성화하면 CallKit의 사운드 트랙이 끊어지지 않음
            // (setActive를 옵션 없이 호출하면 이미 활성화된 세션을 재활성화하는 것이므로 안전함)
            try session.setActive(true)
            print("✅ [LiveKitPlugin] Audio session reactivated after overrideOutputAudioPort")
            
            // 출력 라우트 확인 (전환 검증)
            let currentRoute = session.currentRoute
            var actualSpeakerMode = false
            for output in currentRoute.outputs {
                if output.portType == .builtInSpeaker {
                    actualSpeakerMode = true
                    break
                }
            }
            print("📱 [LiveKitPlugin] Current output route: \(currentRoute.outputs.map { $0.portType.rawValue }.joined(separator: ", "))")
            print("📱 [LiveKitPlugin] Actual speaker mode: \(actualSpeakerMode), requested: \(speaker)")
            
            // 실제 라우트가 요청한 모드와 일치하는지 확인
            if actualSpeakerMode != speaker {
                print("⚠️ [LiveKitPlugin] Route mismatch detected, retrying...")
                // 재시도 (약간의 딜레이 후)
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                    do {
                        if speaker {
                            try session.overrideOutputAudioPort(.speaker)
                        } else {
                            try session.overrideOutputAudioPort(.none)
                        }
                        try session.setActive(true)
                        print("✅ [LiveKitPlugin] Retry successful")
                    } catch {
                        print("❌ [LiveKitPlugin] Retry failed: \(error)")
                    }
                }
            }
            
            call.resolve(["success": true, "speaker": speaker])
        } catch {
            print("❌ [LiveKitPlugin] Failed to set speaker mode: \(error)")
            call.reject("Failed to set speaker mode: \(error.localizedDescription)")
        }
    }
    
    @objc func isConnected(_ call: CAPPluginCall) {
        let connected = room?.connectionState == .connected
        call.resolve([
            "connected": connected,
            "roomName": currentRoomName ?? ""
        ])
    }
    
    // MARK: - CallKit Methods
    @objc func startOutgoingCall(_ call: CAPPluginCall) {
        guard let callerName = call.getString("callerName") else {
            call.reject("Missing callerName")
            return
        }
        
        let callUUID = UUID()
        self.currentCallUUID = callUUID
        IncomingCallManager.shared.currentCallUUID = callUUID
        
        print("📞 [LiveKitPlugin] Starting outgoing call to: \(callerName)")
        
        CallKitManager.shared.startOutgoingCall(uuid: callUUID, handle: callerName) { success in
            if success {
                call.resolve([
                    "success": true,
                    "callUUID": callUUID.uuidString
                ])
                self.notifyListeners("outgoingCallStarted", data: ["callUUID": callUUID.uuidString])
            } else {
                call.reject("Failed to start outgoing call")
            }
        }
    }
    
    @objc func reportOutgoingCallConnected(_ call: CAPPluginCall) {
        guard let uuid = currentCallUUID else {
            call.reject("No active call")
            return
        }
        
        print("✅ [LiveKitPlugin] Reporting outgoing call connected")
        CallKitManager.shared.reportOutgoingCallConnected(uuid: uuid)
        call.resolve(["success": true])
    }
    
    @objc func reportIncomingCall(_ call: CAPPluginCall) {
        guard let callerId = call.getString("callerId"),
              let callerName = call.getString("callerName"),
              let roomName = call.getString("roomName") else {
            call.reject("Missing required parameters")
            return
        }
        
        let callUUID = UUID()
        self.currentCallUUID = callUUID
        IncomingCallManager.shared.currentCallUUID = callUUID
        
        print("📞 [LiveKitPlugin] Reporting incoming call from: \(callerName)")
        
        CallKitManager.shared.reportIncomingCall(uuid: callUUID, handle: callerName, callerName: callerName) { error in
            if let error = error {
                call.reject("Failed to report incoming call: \(error.localizedDescription)")
            } else {
                call.resolve([
                    "success": true,
                    "callUUID": callUUID.uuidString
                ])
            }
        }
    }
    
    @objc func endCall(_ call: CAPPluginCall) {
        let uuid = currentCallUUID ?? IncomingCallManager.shared.currentCallUUID
        print("📴 [LiveKitPlugin] Ending call, UUID: \(uuid?.uuidString ?? "nil")")
        
        if let uuid = uuid {
            CallKitManager.shared.endCall(uuid: uuid)
            self.currentCallUUID = nil
            IncomingCallManager.shared.currentCallUUID = nil
        } else {
            print("⚠️ [LiveKitPlugin] No call UUID to end")
        }
        
        Task { @MainActor in
            await cleanupRoom()
            // 비디오 뷰 정리
            await MainActor.run {
                hideVideoViewsInternal()
            }
        }
        
        IncomingCallManager.shared.clearPendingCallInfo()
        isConnecting = false
        
        call.resolve(["success": true])
    }
    
    // MARK: - Native Video Views
    @objc func showVideoViews(_ call: CAPPluginCall) {
        let localX = call.getFloat("localX") ?? 0
        let localY = call.getFloat("localY") ?? 0
        let localWidth = call.getFloat("localWidth") ?? 112
        let localHeight = call.getFloat("localHeight") ?? 144
        let remoteX = call.getFloat("remoteX") ?? 0
        let remoteY = call.getFloat("remoteY") ?? 0
        let remoteWidth = call.getFloat("remoteWidth") ?? Float(UIScreen.main.bounds.width)
        let remoteHeight = call.getFloat("remoteHeight") ?? Float(UIScreen.main.bounds.height)
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            
            guard let webView = self.bridge?.webView,
                  let parentView = webView.superview else {
                call.reject("WebView not available")
                return
            }
            
            // WebView는 숨기지 않음 - 컨테이너로 덮기만 함
            // (미니모드 전환 시 WebView 상태가 변경되는 문제 방지)
            
            // 컨테이너 뷰 생성 (WebView 위에 덮기)
            if self.videoContainerView == nil {
                let container = UIView(frame: parentView.bounds)
                container.backgroundColor = .black
                container.autoresizingMask = [.flexibleWidth, .flexibleHeight]
                parentView.addSubview(container)
                parentView.bringSubviewToFront(container) // WebView 위에 표시
                self.videoContainerView = container
            } else {
                parentView.bringSubviewToFront(self.videoContainerView!)
            }
            
            // 원격 비디오 뷰 (전체 화면)
            if self.remoteVideoView == nil {
                let remoteView = VideoView(frame: CGRect(x: CGFloat(remoteX), y: CGFloat(remoteY), width: CGFloat(remoteWidth), height: CGFloat(remoteHeight)))
                remoteView.layoutMode = .fill
                remoteView.backgroundColor = .black
                self.videoContainerView?.addSubview(remoteView)
                self.remoteVideoView = remoteView
            } else {
                self.remoteVideoView?.frame = CGRect(x: CGFloat(remoteX), y: CGFloat(remoteY), width: CGFloat(remoteWidth), height: CGFloat(remoteHeight))
            }
            
            // 로컬 비디오 뷰 (작은 화면)
            if self.localVideoView == nil {
                let localView = VideoView(frame: CGRect(x: CGFloat(localX), y: CGFloat(localY), width: CGFloat(localWidth), height: CGFloat(localHeight)))
                localView.layoutMode = .fill
                localView.backgroundColor = UIColor.darkGray
                localView.layer.cornerRadius = 12
                localView.layer.masksToBounds = true
                localView.layer.borderWidth = 2
                localView.layer.borderColor = UIColor.white.withAlphaComponent(0.3).cgColor
                localView.transform = CGAffineTransform(scaleX: -1, y: 1) // 미러링
                self.videoContainerView?.addSubview(localView)
                self.localVideoView = localView
            } else {
                self.localVideoView?.frame = CGRect(x: CGFloat(localX), y: CGFloat(localY), width: CGFloat(localWidth), height: CGFloat(localHeight))
            }
            
            // 로컬 비디오 트랙 연결
            if let localTrack = self.localVideoTrack {
                self.localVideoView?.track = localTrack
                print("📹 [LiveKitPlugin] Local video track attached")
            } else {
                print("⚠️ [LiveKitPlugin] Local video track is nil")
            }
            
            // 원격 비디오 트랙 연결
            if let room = self.room {
                for participant in room.remoteParticipants.values {
                    for publication in participant.trackPublications.values {
                        if publication.kind == .video, let track = publication.track as? VideoTrack {
                            self.remoteVideoView?.track = track
                            print("📹 [LiveKitPlugin] Remote video track attached")
                            break
                        }
                    }
                }
            }
            
            // 버튼 UI 추가
            self.setupVideoCallButtons()
            
            print("✅ [LiveKitPlugin] Native video UI shown, WebView hidden")
            call.resolve(["success": true])
        }
    }
    
    private func setupVideoCallButtons() {
        guard let container = videoContainerView else { return }
        
        let screenWidth = container.bounds.width
        let screenHeight = container.bounds.height
        let smallButtonSize: CGFloat = 56 // w-14
        let endButtonSize: CGFloat = 64 // w-16
        let buttonSpacing: CGFloat = 24 // gap-6
        let bottomPadding: CGFloat = 34 // pb-8 + safe area
        
        // 하단 그라데이션 컨테이너
        if controlContainerView == nil {
            let gradientHeight: CGFloat = 200
            let controlView = UIView(frame: CGRect(x: 0, y: screenHeight - gradientHeight, width: screenWidth, height: gradientHeight))
            
            // 그라데이션 레이어
            let gradientLayer = CAGradientLayer()
            gradientLayer.frame = controlView.bounds
            gradientLayer.colors = [UIColor.clear.cgColor, UIColor.black.withAlphaComponent(0.8).cgColor]
            gradientLayer.locations = [0.0, 1.0]
            controlView.layer.insertSublayer(gradientLayer, at: 0)
            
            container.addSubview(controlView)
            controlContainerView = controlView
        }
        
        guard let controlView = controlContainerView else { return }
        
        // 상단 버튼 줄 (음소거, 카메라전환, 비디오, 스피커) - 4개 버튼
        let topButtonsY: CGFloat = controlView.bounds.height - bottomPadding - endButtonSize - 24 - smallButtonSize
        let topButtonsWidth = smallButtonSize * 4 + buttonSpacing * 3
        let topButtonsStartX = (screenWidth - topButtonsWidth) / 2
        
        // 음소거 버튼
        if muteButton == nil {
            let btn = createControlButton(size: smallButtonSize, imageName: "mic.fill", isActive: false)
            btn.frame = CGRect(x: topButtonsStartX, y: topButtonsY, width: smallButtonSize, height: smallButtonSize)
            btn.addTarget(self, action: #selector(muteButtonTapped), for: .touchUpInside)
            controlView.addSubview(btn)
            muteButton = btn
        }
        
        // 카메라 전환 버튼
        if cameraFlipButton == nil {
            let btn = createControlButton(size: smallButtonSize, imageName: "camera.rotate.fill", isActive: false)
            btn.frame = CGRect(x: topButtonsStartX + smallButtonSize + buttonSpacing, y: topButtonsY, width: smallButtonSize, height: smallButtonSize)
            btn.addTarget(self, action: #selector(cameraFlipButtonTapped), for: .touchUpInside)
            controlView.addSubview(btn)
            cameraFlipButton = btn
        }
        
        // 비디오 토글 버튼
        if videoToggleButton == nil {
            let btn = createControlButton(size: smallButtonSize, imageName: "video.fill", isActive: false)
            btn.frame = CGRect(x: topButtonsStartX + (smallButtonSize + buttonSpacing) * 2, y: topButtonsY, width: smallButtonSize, height: smallButtonSize)
            btn.addTarget(self, action: #selector(videoToggleButtonTapped), for: .touchUpInside)
            controlView.addSubview(btn)
            videoToggleButton = btn
        }
        
        // 스피커 버튼
        if speakerButton == nil {
            let btn = createControlButton(size: smallButtonSize, imageName: "speaker.wave.3.fill", isActive: true)
            btn.frame = CGRect(x: topButtonsStartX + (smallButtonSize + buttonSpacing) * 3, y: topButtonsY, width: smallButtonSize, height: smallButtonSize)
            btn.addTarget(self, action: #selector(speakerButtonTapped), for: .touchUpInside)
            controlView.addSubview(btn)
            speakerButton = btn
        }
        
        // 종료 버튼 (하단 중앙)
        if endCallButton == nil {
            let btn = UIButton(type: .system)
            btn.frame = CGRect(x: (screenWidth - endButtonSize) / 2, y: controlView.bounds.height - bottomPadding - endButtonSize, width: endButtonSize, height: endButtonSize)
            btn.backgroundColor = UIColor.systemRed
            btn.layer.cornerRadius = endButtonSize / 2
            btn.setImage(UIImage(systemName: "phone.down.fill")?.withConfiguration(UIImage.SymbolConfiguration(pointSize: 28, weight: .medium)), for: .normal)
            btn.tintColor = .white
            btn.addTarget(self, action: #selector(endCallButtonTapped), for: .touchUpInside)
            controlView.addSubview(btn)
            endCallButton = btn
        }
        
        // 최소화 버튼 (상단 왼쪽)
        if miniModeButton == nil {
            let btn = UIButton(type: .system)
            btn.frame = CGRect(x: 16, y: 50, width: 40, height: 40)
            btn.backgroundColor = UIColor.black.withAlphaComponent(0.4)
            btn.layer.cornerRadius = 20
            btn.setImage(UIImage(systemName: "arrow.down.right.and.arrow.up.left")?.withConfiguration(UIImage.SymbolConfiguration(pointSize: 18, weight: .medium)), for: .normal)
            btn.tintColor = .white
            btn.addTarget(self, action: #selector(miniModeButtonTapped), for: .touchUpInside)
            container.addSubview(btn)
            miniModeButton = btn
        }
    }
    
    @objc private func miniModeButtonTapped() {
        enterMiniMode()
    }
    
    private func enterMiniMode() {
        guard let container = videoContainerView,
              let webView = bridge?.webView,
              let parentView = webView.superview else { return }
        
        isInMiniMode = true
        
        // 컨트롤 버튼들 숨기기
        controlContainerView?.isHidden = true
        miniModeButton?.isHidden = true
        localVideoView?.isHidden = true
        
        // 컨테이너를 작은 플로팅 창으로 변환
        let miniWidth: CGFloat = 120
        let miniHeight: CGFloat = 160
        let safeBottom: CGFloat = 100
        let rightMargin: CGFloat = 16
        
        // 미니모드 프레임 계산
        let miniFrame = CGRect(
            x: parentView.bounds.width - miniWidth - rightMargin,
            y: parentView.bounds.height - miniHeight - safeBottom,
            width: miniWidth,
            height: miniHeight
        )
        
        // WebView는 이미 표시되어 있음 (숨기지 않았음)
        // 컨테이너만 작게 만들면 WebView가 보임
        
        // 컨테이너를 맨 앞으로 가져오기
        parentView.bringSubviewToFront(container)
        
        // 확대 버튼 먼저 추가 (애니메이션 전)
        if expandButton == nil {
            let btn = UIButton(type: .system)
            btn.backgroundColor = .clear
            btn.addTarget(self, action: #selector(expandButtonTapped), for: .touchUpInside)
            container.addSubview(btn)
            expandButton = btn
        }
        
        // 애니메이션
        UIView.animate(withDuration: 0.3, animations: {
            container.frame = miniFrame
            container.layer.cornerRadius = 16
            container.clipsToBounds = true
        }) { _ in
            // 애니메이션 완료 후 내부 뷰 크기 조정
            self.remoteVideoView?.frame = CGRect(x: 0, y: 0, width: miniWidth, height: miniHeight)
            self.expandButton?.frame = CGRect(x: 0, y: 0, width: miniWidth, height: miniHeight)
            self.expandButton?.isHidden = false
        }
        
        // 팬 제스처 추가 (드래그) - 기존 제스처 제거 후 추가
        container.gestureRecognizers?.forEach { gesture in
            if gesture is UIPanGestureRecognizer {
                container.removeGestureRecognizer(gesture)
            }
        }
        let panGesture = UIPanGestureRecognizer(target: self, action: #selector(handleMiniModePan(_:)))
        container.addGestureRecognizer(panGesture)
        
        print("📱 [LiveKitPlugin] Entered mini mode")
        notifyListeners("miniModeChanged", data: ["isMinimized": true])
    }
    
    @objc private func handleMiniModePan(_ gesture: UIPanGestureRecognizer) {
        guard let container = videoContainerView,
              let parentView = container.superview else { return }
        
        let translation = gesture.translation(in: parentView)
        
        if gesture.state == .changed {
            var newCenter = CGPoint(
                x: container.center.x + translation.x,
                y: container.center.y + translation.y
            )
            
            // 화면 경계 제한
            let halfWidth = container.bounds.width / 2
            let halfHeight = container.bounds.height / 2
            newCenter.x = max(halfWidth, min(parentView.bounds.width - halfWidth, newCenter.x))
            newCenter.y = max(halfHeight + 50, min(parentView.bounds.height - halfHeight - 50, newCenter.y))
            
            container.center = newCenter
            gesture.setTranslation(.zero, in: parentView)
        }
    }
    
    @objc private func expandButtonTapped() {
        exitMiniMode()
    }
    
    private func exitMiniMode() {
        guard let container = videoContainerView,
              let webView = bridge?.webView,
              let parentView = webView.superview else { return }
        
        isInMiniMode = false
        expandButton?.isHidden = true
        
        // 팬 제스처 제거
        container.gestureRecognizers?.forEach { gesture in
            if gesture is UIPanGestureRecognizer {
                container.removeGestureRecognizer(gesture)
            }
        }
        
        // 컨테이너를 전체 화면으로 복원 (WebView를 다시 덮음)
        let fullFrame = parentView.bounds
        UIView.animate(withDuration: 0.3, animations: {
            container.frame = fullFrame
            container.layer.cornerRadius = 0
        }) { _ in
            // 애니메이션 완료 후
            self.remoteVideoView?.frame = container.bounds
            
            // WebView는 숨기지 않음 - 컨테이너가 덮고 있음
            
            // 컨트롤 버튼들 다시 표시
            self.controlContainerView?.isHidden = false
            self.miniModeButton?.isHidden = false
            self.localVideoView?.isHidden = false
        }
        
        print("📱 [LiveKitPlugin] Exited mini mode")
        notifyListeners("miniModeChanged", data: ["isMinimized": false])
    }
    
    private func createControlButton(size: CGFloat, imageName: String, isActive: Bool) -> UIButton {
        let btn = UIButton(type: .custom)
        btn.layer.cornerRadius = size / 2
        btn.clipsToBounds = true
        updateControlButtonStyle(btn, imageName: imageName, isActive: isActive)
        return btn
    }
    
    private func updateControlButtonStyle(_ button: UIButton, imageName: String, isActive: Bool, size: CGFloat = 56) {
        button.backgroundColor = isActive ? .white : UIColor.black.withAlphaComponent(0.4)
        let image = UIImage(systemName: imageName)?.withConfiguration(UIImage.SymbolConfiguration(pointSize: 24, weight: .medium))
        button.setImage(image?.withRenderingMode(.alwaysTemplate), for: .normal)
        button.tintColor = isActive ? UIColor.darkGray : .white
        button.imageView?.contentMode = .scaleAspectFit
    }
    
    @objc private func muteButtonTapped() {
        isMuted = !isMuted
        Task { @MainActor in
            do {
                try await room?.localParticipant.setMicrophone(enabled: !isMuted)
                if let btn = muteButton {
                    updateControlButtonStyle(btn, imageName: isMuted ? "mic.slash.fill" : "mic.fill", isActive: isMuted)
                }
                print("🎤 [LiveKitPlugin] Mute: \(isMuted)")
            } catch {
                print("❌ [LiveKitPlugin] Mute failed: \(error)")
            }
        }
    }
    
    @objc private func videoToggleButtonTapped() {
        isVideoEnabled = !isVideoEnabled
        Task { @MainActor in
            do {
                if isVideoEnabled {
                    // 비디오 켜기
                    if localVideoTrack == nil {
                        let captureOptions = CameraCaptureOptions(dimensions: .h1080_169, fps: 30)
                        let videoTrack = LocalVideoTrack.createCameraTrack(options: captureOptions)
                        localVideoTrack = videoTrack
                        try await room?.localParticipant.publish(videoTrack: videoTrack)
                        localVideoView?.track = videoTrack
                    }
                } else {
                    // 비디오 끄기
                    if let track = localVideoTrack, let participant = room?.localParticipant {
                        for publication in participant.trackPublications.values {
                            if publication.track === track, let localPub = publication as? LocalTrackPublication {
                                try await participant.unpublish(publication: localPub)
                                break
                            }
                        }
                        try await track.stop()
                        localVideoTrack = nil
                        localVideoView?.track = nil
                    }
                }
                
                if let btn = videoToggleButton {
                    updateControlButtonStyle(btn, imageName: isVideoEnabled ? "video.fill" : "video.slash.fill", isActive: !isVideoEnabled)
                }
                print("📹 [LiveKitPlugin] Video: \(isVideoEnabled)")
            } catch {
                print("❌ [LiveKitPlugin] Video toggle failed: \(error)")
            }
        }
    }
    
    @objc private func endCallButtonTapped() {
        print("📴 [LiveKitPlugin] End call button tapped")
        notifyListeners("nativeEndCallTapped", data: [:])
        
        if let uuid = currentCallUUID ?? IncomingCallManager.shared.currentCallUUID {
            CallKitManager.shared.endCall(uuid: uuid)
        }
        
        Task { @MainActor in
            await cleanupRoom()
            hideVideoViewsInternal()
        }
    }
    
    @objc private func speakerButtonTapped() {
        isSpeakerOn = !isSpeakerOn
        do {
            let session = AVAudioSession.sharedInstance()
            try session.overrideOutputAudioPort(isSpeakerOn ? .speaker : .none)
            if let btn = speakerButton {
                updateControlButtonStyle(btn, imageName: isSpeakerOn ? "speaker.wave.3.fill" : "speaker.fill", isActive: isSpeakerOn)
            }
            print("🔊 [LiveKitPlugin] Speaker: \(isSpeakerOn)")
        } catch {
            print("❌ [LiveKitPlugin] Speaker toggle failed: \(error)")
        }
    }
    
    @objc private func cameraFlipButtonTapped() {
        isUsingFrontCamera = !isUsingFrontCamera
        Task { @MainActor in
            do {
                guard let currentTrack = localVideoTrack else {
                    print("⚠️ [LiveKitPlugin] No local video track to flip")
                    return
                }
                
                // 기존 트랙 중지 및 unpublish
                if let participant = room?.localParticipant {
                    for publication in participant.trackPublications.values {
                        if publication.track === currentTrack, let localPub = publication as? LocalTrackPublication {
                            try await participant.unpublish(publication: localPub)
                            break
                        }
                    }
                }
                try await currentTrack.stop()
                
                // 새 카메라로 트랙 생성
                let position: AVCaptureDevice.Position = isUsingFrontCamera ? .front : .back
                let captureOptions = CameraCaptureOptions(
                    position: position,
                    dimensions: .h1080_169,
                    fps: 30
                )
                let newVideoTrack = LocalVideoTrack.createCameraTrack(options: captureOptions)
                localVideoTrack = newVideoTrack
                
                // publish
                try await room?.localParticipant.publish(videoTrack: newVideoTrack)
                
                // VideoView에 연결
                localVideoView?.track = newVideoTrack
                
                // 전면 카메라면 미러링, 후면이면 미러링 해제
                localVideoView?.transform = isUsingFrontCamera ? CGAffineTransform(scaleX: -1, y: 1) : .identity
                
                print("📷 [LiveKitPlugin] Camera flipped to: \(isUsingFrontCamera ? "front" : "back")")
            } catch {
                print("❌ [LiveKitPlugin] Camera flip failed: \(error)")
                isUsingFrontCamera = !isUsingFrontCamera // 롤백
            }
        }
    }
    
    @objc func hideVideoViews(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.hideVideoViewsInternal()
            call.resolve(["success": true])
        }
    }
    
    private func hideVideoViewsInternal() {
        // WebView 다시 표시
        if let webView = bridge?.webView {
            webView.isHidden = false
        }
        
        localVideoView?.track = nil
        remoteVideoView?.track = nil
        localVideoView?.removeFromSuperview()
        remoteVideoView?.removeFromSuperview()
        endCallButton?.removeFromSuperview()
        muteButton?.removeFromSuperview()
        speakerButton?.removeFromSuperview()
        videoToggleButton?.removeFromSuperview()
        cameraFlipButton?.removeFromSuperview()
        miniModeButton?.removeFromSuperview()
        expandButton?.removeFromSuperview()
        controlContainerView?.removeFromSuperview()
        videoContainerView?.removeFromSuperview()
        localVideoView = nil
        remoteVideoView = nil
        endCallButton = nil
        muteButton = nil
        speakerButton = nil
        videoToggleButton = nil
        cameraFlipButton = nil
        miniModeButton = nil
        expandButton = nil
        controlContainerView = nil
        videoContainerView = nil
        isMuted = false
        isSpeakerOn = true
        isVideoEnabled = true
        isUsingFrontCamera = true
        isInMiniMode = false
        print("✅ [LiveKitPlugin] Native video UI hidden, WebView shown")
    }
    
    @objc func setLocalVideoMirrored(_ call: CAPPluginCall) {
        let mirrored = call.getBool("mirrored") ?? true
        DispatchQueue.main.async { [weak self] in
            self?.localVideoView?.transform = mirrored ? CGAffineTransform(scaleX: -1, y: 1) : .identity
            call.resolve(["success": true])
        }
    }
    
    // MARK: - Voice Call Mini Mode
    @objc func showVoiceCallMiniMode(_ call: CAPPluginCall) {
        let partnerName = call.getString("partnerName") ?? "통화 중"
        DispatchQueue.main.async { [weak self] in
            self?.showVoiceCallMiniModeInternal(partnerName: partnerName)
            call.resolve(["success": true])
        }
    }
    
    @objc func hideVoiceCallMiniMode(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.hideVoiceCallMiniModeInternal()
            call.resolve(["success": true])
        }
    }
    
    private func showVoiceCallMiniModeInternal(partnerName: String) {
        guard let webView = bridge?.webView,
              let parentView = webView.superview else { return }
        
        currentPartnerName = partnerName
        isVoiceCallMinimized = true
        voiceCallStartTime = Date()
        
        // 기존 뷰가 있으면 제거
        hideVoiceCallMiniModeInternal()
        
        // 플로팅 뷰 생성
        let floatWidth: CGFloat = 200
        let floatHeight: CGFloat = 80
        let rightMargin: CGFloat = 16
        let bottomMargin: CGFloat = 100
        
        let floatingView = UIView(frame: CGRect(
            x: parentView.bounds.width - floatWidth - rightMargin,
            y: parentView.bounds.height - floatHeight - bottomMargin,
            width: floatWidth,
            height: floatHeight
        ))
        floatingView.backgroundColor = UIColor(red: 0.1, green: 0.1, blue: 0.15, alpha: 0.95)
        floatingView.layer.cornerRadius = 16
        floatingView.layer.shadowColor = UIColor.black.cgColor
        floatingView.layer.shadowOffset = CGSize(width: 0, height: 4)
        floatingView.layer.shadowRadius = 12
        floatingView.layer.shadowOpacity = 0.3
        floatingView.clipsToBounds = false
        
        // 아바타 아이콘
        let avatarSize: CGFloat = 44
        let avatarView = UIView(frame: CGRect(x: 12, y: (floatHeight - avatarSize) / 2, width: avatarSize, height: avatarSize))
        avatarView.backgroundColor = UIColor(red: 0.5, green: 0.3, blue: 0.8, alpha: 1)
        avatarView.layer.cornerRadius = avatarSize / 2
        
        let personIcon = UIImageView(frame: CGRect(x: 10, y: 10, width: 24, height: 24))
        personIcon.image = UIImage(systemName: "person.fill")
        personIcon.tintColor = .white
        personIcon.contentMode = .scaleAspectFit
        avatarView.addSubview(personIcon)
        floatingView.addSubview(avatarView)
        
        // 이름 라벨
        let nameLabel = UILabel(frame: CGRect(x: 64, y: 16, width: 80, height: 20))
        nameLabel.text = partnerName
        nameLabel.textColor = .white
        nameLabel.font = .systemFont(ofSize: 14, weight: .semibold)
        floatingView.addSubview(nameLabel)
        voiceCallNameLabel = nameLabel
        
        // 통화 시간 라벨
        let durationLabel = UILabel(frame: CGRect(x: 64, y: 38, width: 80, height: 18))
        durationLabel.text = "00:00"
        durationLabel.textColor = UIColor(red: 0.3, green: 0.9, blue: 0.5, alpha: 1)
        durationLabel.font = .monospacedDigitSystemFont(ofSize: 12, weight: .medium)
        floatingView.addSubview(durationLabel)
        voiceCallDurationLabel = durationLabel
        
        // 종료 버튼
        let endButton = UIButton(type: .system)
        endButton.frame = CGRect(x: floatWidth - 84, y: (floatHeight - 36) / 2, width: 36, height: 36)
        endButton.backgroundColor = UIColor(red: 0.9, green: 0.2, blue: 0.2, alpha: 1)
        endButton.layer.cornerRadius = 18
        endButton.setImage(UIImage(systemName: "phone.down.fill"), for: .normal)
        endButton.tintColor = .white
        endButton.addTarget(self, action: #selector(voiceCallEndButtonTapped), for: .touchUpInside)
        floatingView.addSubview(endButton)
        voiceCallEndButton = endButton
        
        // 확대 버튼
        let expandButton = UIButton(type: .system)
        expandButton.frame = CGRect(x: floatWidth - 44, y: (floatHeight - 36) / 2, width: 36, height: 36)
        expandButton.backgroundColor = UIColor(red: 0.3, green: 0.3, blue: 0.35, alpha: 1)
        expandButton.layer.cornerRadius = 18
        expandButton.setImage(UIImage(systemName: "arrow.up.left.and.arrow.down.right"), for: .normal)
        expandButton.tintColor = .white
        expandButton.addTarget(self, action: #selector(voiceCallExpandButtonTapped), for: .touchUpInside)
        floatingView.addSubview(expandButton)
        voiceCallExpandButton = expandButton
        
        // 드래그 제스처
        let panGesture = UIPanGestureRecognizer(target: self, action: #selector(handleVoiceCallPan(_:)))
        floatingView.addGestureRecognizer(panGesture)
        
        parentView.addSubview(floatingView)
        parentView.bringSubviewToFront(floatingView)
        voiceCallFloatingView = floatingView
        
        // 통화 시간 타이머 시작
        startVoiceCallDurationTimer()
        
        print("📱 [LiveKitPlugin] Voice call mini mode shown")
        notifyListeners("voiceMiniModeChanged", data: ["isMinimized": true])
    }
    
    private func hideVoiceCallMiniModeInternal() {
        voiceCallDurationTimer?.invalidate()
        voiceCallDurationTimer = nil
        voiceCallFloatingView?.removeFromSuperview()
        voiceCallFloatingView = nil
        voiceCallNameLabel = nil
        voiceCallDurationLabel = nil
        voiceCallExpandButton = nil
        voiceCallEndButton = nil
        isVoiceCallMinimized = false
        print("📱 [LiveKitPlugin] Voice call mini mode hidden")
    }
    
    private func startVoiceCallDurationTimer() {
        voiceCallDurationTimer?.invalidate()
        voiceCallDurationTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.updateVoiceCallDuration()
        }
    }
    
    private func updateVoiceCallDuration() {
        guard let startTime = voiceCallStartTime else { return }
        let elapsed = Int(Date().timeIntervalSince(startTime))
        let minutes = elapsed / 60
        let seconds = elapsed % 60
        voiceCallDurationLabel?.text = String(format: "%02d:%02d", minutes, seconds)
    }
    
    @objc private func handleVoiceCallPan(_ gesture: UIPanGestureRecognizer) {
        guard let floatingView = voiceCallFloatingView,
              let parentView = floatingView.superview else { return }
        
        let translation = gesture.translation(in: parentView)
        
        if gesture.state == .changed {
            var newCenter = CGPoint(
                x: floatingView.center.x + translation.x,
                y: floatingView.center.y + translation.y
            )
            
            let halfWidth = floatingView.bounds.width / 2
            let halfHeight = floatingView.bounds.height / 2
            newCenter.x = max(halfWidth, min(parentView.bounds.width - halfWidth, newCenter.x))
            newCenter.y = max(halfHeight + 50, min(parentView.bounds.height - halfHeight - 50, newCenter.y))
            
            floatingView.center = newCenter
            gesture.setTranslation(.zero, in: parentView)
        }
    }
    
    @objc private func voiceCallEndButtonTapped() {
        print("📴 [LiveKitPlugin] Voice mini mode: End call tapped")
        hideVoiceCallMiniModeInternal()
        
        // 통화 종료
        Task { @MainActor in
            await cleanupRoom()
            CallKitManager.shared.endCall(uuid: currentCallUUID ?? UUID())
        }
        
        notifyListeners("voiceMiniModeCallEnded", data: [:])
    }
    
    @objc private func voiceCallExpandButtonTapped() {
        print("📱 [LiveKitPlugin] Voice mini mode: Expand tapped")
        hideVoiceCallMiniModeInternal()
        notifyListeners("voiceMiniModeExpanded", data: [
            "partnerName": currentPartnerName
        ])
    }
    
    // MARK: - VoIP Push
    @objc func registerVoIPPush(_ call: CAPPluginCall) {
        call.resolve([
            "success": true,
            "token": IncomingCallManager.shared.voipToken ?? ""
        ])
    }
    
    @objc func getVoIPToken(_ call: CAPPluginCall) {
        let apnsEnv = Self.detectApnsEnvironment()
        call.resolve([
            "token": IncomingCallManager.shared.voipToken ?? "",
            "apnsEnv": apnsEnv
        ])
    }
    
    // MARK: - Pending Call Info
    @objc func getPendingCallInfo(_ call: CAPPluginCall) {
        if let info = IncomingCallManager.shared.getPendingCallInfo() {
            call.resolve([
                "hasPendingCall": true,
                "callerId": info["callerId"] as? String ?? "",
                "callerName": info["callerName"] as? String ?? "",
                "roomName": info["roomName"] as? String ?? "",
                "livekitUrl": info["livekitUrl"] as? String ?? "",
                "livekitToken": info["livekitToken"] as? String ?? "",
                "callType": info["callType"] as? String ?? "voice"
            ])
        } else {
            call.resolve(["hasPendingCall": false])
        }
    }
    
    @objc func clearPendingCallInfo(_ call: CAPPluginCall) {
        IncomingCallManager.shared.clearPendingCallInfo()
        call.resolve(["success": true])
    }
    
    // MARK: - Active Call State (포그라운드 복귀 시 사용)
    @objc func getActiveCallState(_ call: CAPPluginCall) {
        let connectionState = room?.connectionState
        let isConnected = connectionState == .connected
        
        print("📱 [LiveKitPlugin] getActiveCallState - room: \(room != nil), connectionState: \(String(describing: connectionState)), activeCallInfo: \(activeCallInfo != nil)")
        
        // 연결됨 + 통화 정보 있음
        if isConnected, let info = activeCallInfo {
            print("✅ [LiveKitPlugin] Active call found")
            call.resolve([
                "hasActiveCall": true,
                "isConnected": true,
                "callerId": info["callerId"] as? String ?? "",
                "callerName": info["callerName"] as? String ?? "",
                "roomName": info["roomName"] as? String ?? "",
                "livekitUrl": info["livekitUrl"] as? String ?? "",
                "livekitToken": info["livekitToken"] as? String ?? ""
            ])
        }
        // 아직 연결 중이거나 통화 정보만 있음 (pending)
        else if let info = activeCallInfo {
            print("⏳ [LiveKitPlugin] Active call pending, isConnected: \(isConnected)")
            call.resolve([
                "hasActiveCall": true,
                "isConnected": isConnected,
                "callerId": info["callerId"] as? String ?? "",
                "callerName": info["callerName"] as? String ?? "",
                "roomName": info["roomName"] as? String ?? "",
                "livekitUrl": info["livekitUrl"] as? String ?? "",
                "livekitToken": info["livekitToken"] as? String ?? ""
            ])
        } else {
            print("❌ [LiveKitPlugin] No active call")
            call.resolve([
                "hasActiveCall": false,
                "isConnected": isConnected
            ])
        }
    }
    
    @objc func clearActiveCallState(_ call: CAPPluginCall) {
        activeCallInfo = nil
        call.resolve(["success": true])
    }
    
    private func saveActiveCallInfo(_ info: [String: Any]) {
        activeCallInfo = info
        
        // UserDefaults에도 저장 (앱 재시작 시 복원용)
        let defaults = UserDefaults.standard
        defaults.set(info["callerId"] as? String ?? "", forKey: "active_call_caller_id")
        defaults.set(info["callerName"] as? String ?? "", forKey: "active_call_caller_name")
        defaults.set(info["roomName"] as? String ?? "", forKey: "active_call_room_name")
        defaults.set(info["livekitUrl"] as? String ?? "", forKey: "active_call_livekit_url")
        defaults.set(info["livekitToken"] as? String ?? "", forKey: "active_call_livekit_token")
        defaults.synchronize()
        
        print("💾 [LiveKitPlugin] Active call info saved: \(info["callerName"] ?? "unknown")")
    }
    
    private func clearSavedActiveCallInfo() {
        activeCallInfo = nil
        
        let defaults = UserDefaults.standard
        defaults.removeObject(forKey: "active_call_caller_id")
        defaults.removeObject(forKey: "active_call_caller_name")
        defaults.removeObject(forKey: "active_call_room_name")
        defaults.removeObject(forKey: "active_call_livekit_url")
        defaults.removeObject(forKey: "active_call_livekit_token")
        defaults.synchronize()
        
        print("🧹 [LiveKitPlugin] Active call info cleared")
    }
    
    private func loadActiveCallInfoFromDefaults() -> [String: Any]? {
        let defaults = UserDefaults.standard
        let callerId = defaults.string(forKey: "active_call_caller_id") ?? ""
        let callerName = defaults.string(forKey: "active_call_caller_name") ?? ""
        let roomName = defaults.string(forKey: "active_call_room_name") ?? ""
        
        if !roomName.isEmpty {
            return [
                "callerId": callerId,
                "callerName": callerName,
                "roomName": roomName,
                "livekitUrl": defaults.string(forKey: "active_call_livekit_url") ?? "",
                "livekitToken": defaults.string(forKey: "active_call_livekit_token") ?? ""
            ]
        }
        return nil
    }
    
    // MARK: - Dial Tone
    @objc func startDialTone(_ call: CAPPluginCall) {
        playDialTone()
        call.resolve(["success": true])
    }
    
    @objc func stopDialTone(_ call: CAPPluginCall) {
        stopDialToneSound()
        call.resolve(["success": true])
    }
    
    // MARK: - Private Methods
    private func configureAudioSession(callType: String = "voice") throws {
        let session = AVAudioSession.sharedInstance()
        
        // CallKit이 이미 오디오 세션을 활성화했는지 확인
        // CallKit이 활성화한 경우 (category가 이미 .playAndRecord이고 모드가 .voiceChat) 다시 활성화하지 않음
        if session.category == .playAndRecord && session.mode == .voiceChat {
            print("🎵 [LiveKitPlugin] CallKit already activated audio session, skipping reactivation")
            // CallKit이 이미 오디오 세션을 관리하고 있으므로 스킵
            return
        }
        
        // 통화 중 볼륨 조절이 제대로 동작하도록 옵션 설정
        // 영상통화는 스피커폰 기본, 음성통화는 이어피스 기본
        var options: AVAudioSession.CategoryOptions = [.allowBluetooth]
        let isVideoCall = callType == "video"
        if isVideoCall {
            options.insert(.defaultToSpeaker)
            print("📹 [LiveKitPlugin] Video call - using speaker mode")
        } else {
            print("📞 [LiveKitPlugin] Voice call - using earpiece mode")
        }
        
        // mixWithOthers 제거 (CallKit과 충돌 방지)
        try session.setCategory(.playAndRecord, mode: .voiceChat, options: options)
        
        // 이미 활성화된 경우 옵션 없이 재활성화 (충돌 방지)
        // CallKit이 활성화한 경우는 위에서 이미 return했으므로 여기서는 새로 활성화
        do {
            try session.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            // 이미 활성화된 경우 옵션 없이 재활성화 시도
            print("⚠️ [LiveKitPlugin] Failed to activate with options, trying without options: \(error)")
            try session.setActive(true)
        }
        print("✅ [LiveKitPlugin] Audio session configured for call")
    }
    
    private func cleanupRoom() async {
        print("🧹 [LiveKitPlugin] Cleaning up room")
        stopDialToneSound()
        clearSavedActiveCallInfo()
        
        // 화면 자동 꺼짐 다시 활성화
        await MainActor.run {
            UIApplication.shared.isIdleTimerDisabled = false
            print("💡 [LiveKitPlugin] Idle timer re-enabled")
        }
        
        localAudioTrack = nil
        localVideoTrack = nil
        
        await room?.disconnect()
        room = nil
        currentRoomName = nil
        isConnecting = false
        
        // 오디오 세션 복원 (백그라운드 음악 재생 허용)
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setActive(false, options: .notifyOthersOnDeactivation)
            print("✅ [LiveKitPlugin] Audio session deactivated, background music can resume")
        } catch {
            print("⚠️ [LiveKitPlugin] Failed to deactivate audio session: \(error)")
        }
    }
    
    private func setupCallKitCallbacks() {
        CallKitManager.shared.onCallAnswered = { [weak self] (uuid: UUID) in
            guard let self = self else { return }
            print("📞 [LiveKitPlugin] Call answered via CallKit, UUID: \(uuid.uuidString)")
            
            self.currentCallUUID = uuid
            
            if let info = IncomingCallManager.shared.getPendingCallInfo() {
                // 통화 정보 저장 (포그라운드 복귀 시 사용)
                self.saveActiveCallInfo(info)
                
                // 네이티브에서도 LiveKit 연결 (오디오 트랙 발행을 위해)
                if let url = info["livekitUrl"] as? String,
                   let token = info["livekitToken"] as? String,
                   let roomName = info["roomName"] as? String {
                    let callType = info["callType"] as? String ?? "voice"
                    print("📞 [LiveKitPlugin] Call answered - connecting native Room to LiveKit")
                    self.connectToLiveKitRoom(url: url, token: token, roomName: roomName, callType: callType)
                } else {
                    print("⚠️ [LiveKitPlugin] Missing LiveKit info, web will connect")
                }
            }
            
            self.notifyListeners("callAnswered", data: [
                "callUUID": uuid.uuidString,
                "hasPendingInfo": IncomingCallManager.shared.getPendingCallInfo() != nil
            ])
        }
        
        CallKitManager.shared.onCallEnded = { [weak self] (uuid: UUID, reason: String) in
            guard let self = self else { return }
            print("📴 [LiveKitPlugin] Call ended via CallKit, reason: \(reason)")
            
            let pendingInfo = IncomingCallManager.shared.getPendingCallInfo()
            
            self.notifyListeners("callEnded", data: [
                "callUUID": uuid.uuidString,
                "reason": reason,
                "callerId": pendingInfo?["callerId"] as? String ?? "",
                "roomName": pendingInfo?["roomName"] as? String ?? ""
            ])
            
            Task { @MainActor in
                await self.cleanupRoom()
            }
            
            self.currentCallUUID = nil
        }
        
        CallKitManager.shared.onMuteChanged = { [weak self] (muted: Bool) in
            self?.notifyListeners("muteChanged", data: ["muted": muted])
        }
        
        IncomingCallManager.shared.onVoIPTokenReceived = { [weak self] (token: String) in
            let apnsEnv = Self.detectApnsEnvironment()
            print("📱 [LiveKitPlugin] VoIP token with apnsEnv: \(apnsEnv)")
            self?.notifyListeners("voipTokenReceived", data: ["token": token, "apnsEnv": apnsEnv])
        }
        
        print("✅ [LiveKitPlugin] CallKit callbacks setup complete")
    }
    
    private func connectToLiveKitRoom(url: String, token: String, roomName: String, callType: String = "voice") {
        guard !isConnecting else {
            print("⚠️ [LiveKitPlugin] Already connecting, skipping")
            return
        }
        
        isConnecting = true
        let isVideoCall = callType == "video"
        
        // 연결 중 컬러링 재생
        playDialTone()
        
        Task { @MainActor in
            do {
                // 기존 Room이 있으면 먼저 정리 (중복 연결 방지)
                if self.room != nil {
                    print("⚠️ [LiveKitPlugin] Existing room found, cleaning up first")
                    await self.cleanupRoom()
                }
                
                // LiveKit AudioManager 스피커 설정 (영상통화: 스피커, 음성통화: 이어피스)
                AudioManager.shared.isSpeakerOutputPreferred = isVideoCall
                print("🔊 [LiveKitPlugin] AudioManager.isSpeakerOutputPreferred = \(isVideoCall)")
                
                // CallKit이 오디오 세션을 활성화하지 않은 경우에만 설정
                // CallKit이 활성화한 경우는 스킵하여 충돌 방지
                do {
                    try configureAudioSession(callType: callType)
                } catch {
                    print("⚠️ [LiveKitPlugin] Audio session configuration failed (may be already active): \(error)")
                    // 오디오 세션이 이미 활성화된 경우 계속 진행
                }
                
                let room = Room()
                self.room = room
                self.currentRoomName = roomName
                
                room.add(delegate: self)
                
                print("🔌 [LiveKitPlugin] Connecting to LiveKit: \(roomName), callType: \(callType)")
                try await room.connect(url: url, token: token)
                print("✅ [LiveKitPlugin] Connected to room, local participant identity: \(room.localParticipant.identity?.stringValue ?? "unknown")")
                print("👥 [LiveKitPlugin] Remote participants count after connect: \(room.remoteParticipants.count)")
                
                // 오디오 트랙 발행 (마이크 입력 캡처 옵션 명시)
                print("🎤 [LiveKitPlugin] Creating local audio track with microphone...")
                let audioOptions = AudioCaptureOptions(
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: false
                )
                let audioTrack = LocalAudioTrack.createTrack(options: audioOptions)
                self.localAudioTrack = audioTrack
                print("🎤 [LiveKitPlugin] Audio track created with options, publishing...")
                print("🎤 [LiveKitPlugin] Audio track muted: \(audioTrack.isMuted)")
                try await room.localParticipant.publish(audioTrack: audioTrack)
                print("✅ [LiveKitPlugin] Audio track published successfully, trackSid: \(audioTrack.sid?.stringValue ?? "unknown")")
                print("🎤 [LiveKitPlugin] Audio track final state - muted: \(audioTrack.isMuted)")
                
                // 마이크 활성화 (오디오 데이터 전송을 위해 필수)
                try await room.localParticipant.setMicrophone(enabled: true)
                print("✅ [LiveKitPlugin] Microphone enabled - audio should be transmitting")
                
                // 영상통화일 경우 비디오 트랙도 발행 (HD 화질)
                if isVideoCall {
                    print("📹 [LiveKitPlugin] Publishing video track for video call (HD)")
                    let captureOptions = CameraCaptureOptions(
                        dimensions: .h1080_169,
                        fps: 30
                    )
                    let videoTrack = LocalVideoTrack.createCameraTrack(options: captureOptions)
                    self.localVideoTrack = videoTrack
                    try await room.localParticipant.publish(videoTrack: videoTrack)
                    
                    // VideoView가 이미 있으면 연결
                    if let localView = self.localVideoView {
                        localView.track = videoTrack
                        print("📹 [LiveKitPlugin] Local video track auto-attached to view")
                    }
                    
                    // 영상통화 중 화면 자동 꺼짐 방지
                    UIApplication.shared.isIdleTimerDisabled = true
                    print("💡 [LiveKitPlugin] Idle timer disabled for video call")
                }
                
                // 스피커/이어피스 설정은 didActivate에서 처리 (CallKit이 관리)
                print("✅ [LiveKitPlugin] Auto-connected to room: \(roomName)")
                
                self.notifyListeners("autoConnected", data: [
                    "roomName": roomName,
                    "success": true,
                    "callType": callType
                ])
                
                stopDialToneSound()
                isConnecting = false
            } catch {
                print("❌ [LiveKitPlugin] Auto-connect failed: \(error)")
                isConnecting = false
                
                self.notifyListeners("autoConnected", data: [
                    "roomName": roomName,
                    "success": false,
                    "error": error.localizedDescription
                ])
            }
        }
    }
    
    private func playDialTone() {
        guard let path = Bundle.main.path(forResource: "dialing", ofType: "mp3") else {
            print("⚠️ [LiveKitPlugin] Dial tone file not found")
            return
        }
        let url = URL(fileURLWithPath: path)
        
        do {
            audioPlayer = try AVAudioPlayer(contentsOf: url)
            audioPlayer?.numberOfLoops = -1
            audioPlayer?.play()
            print("🎵 [LiveKitPlugin] Dial tone started")
        } catch {
            print("❌ [LiveKitPlugin] Failed to play dial tone: \(error)")
        }
    }
    
    private func stopDialToneSound() {
        audioPlayer?.stop()
        audioPlayer = nil
    }
}

// MARK: - RoomDelegate
extension LiveKitPlugin: RoomDelegate {
    public func room(_ room: Room, didUpdateConnectionState connectionState: ConnectionState, from oldState: ConnectionState) {
        print("📡 [LiveKitPlugin] Connection state: \(oldState) -> \(connectionState)")
        if connectionState == .disconnected {
            notifyListeners("disconnected", data: ["reason": "connection_lost"])
        }
    }
    
    public func room(_ room: Room, participantDidConnect participant: RemoteParticipant) {
        print("👤 [LiveKitPlugin] Participant connected: \(participant.identity?.stringValue ?? "unknown")")
        
        // 상대방 연결 시 컬러링 중지
        stopDialToneSound()
        
        notifyListeners("participantConnected", data: [
            "participantId": participant.identity?.stringValue ?? "",
            "participantName": participant.name ?? ""
        ])
    }
    
    public func room(_ room: Room, participantDidDisconnect participant: RemoteParticipant) {
        print("👤 [LiveKitPlugin] Participant disconnected: \(participant.identity?.stringValue ?? "unknown")")
        notifyListeners("participantDisconnected", data: [
            "participantId": participant.identity?.stringValue ?? ""
        ])
        
        // 상대방 연결 해제 시 CallKit 통화 종료
        if let uuid = currentCallUUID {
            print("📴 [LiveKitPlugin] Ending CallKit call due to participant disconnect")
            CallKitManager.shared.endCall(uuid: uuid)
        }
    }
    
    public func room(_ room: Room, participant: RemoteParticipant, didSubscribeTrack publication: RemoteTrackPublication) {
        let trackType = publication.kind == .audio ? "audio" : "video"
        print("🎵 [LiveKitPlugin] Track subscribed: \(trackType)")
        
        // 비디오 트랙이면 VideoView에 연결
        if publication.kind == .video, let track = publication.track as? VideoTrack {
            DispatchQueue.main.async { [weak self] in
                self?.remoteVideoView?.track = track
                print("📹 [LiveKitPlugin] Remote video track attached to VideoView")
            }
        }
        
        notifyListeners("trackSubscribed", data: [
            "participantId": participant.identity?.stringValue ?? "",
            "trackType": trackType
        ])
    }
    
    public func room(_ room: Room, participant: RemoteParticipant, didUnsubscribeTrack publication: RemoteTrackPublication) {
        let trackType = publication.kind == .audio ? "audio" : "video"
        print("🎵 [LiveKitPlugin] Track unsubscribed: \(trackType)")
        
        // 비디오 트랙이면 VideoView에서 해제
        if publication.kind == .video {
            DispatchQueue.main.async { [weak self] in
                self?.remoteVideoView?.track = nil
                print("📹 [LiveKitPlugin] Remote video track detached from VideoView")
            }
        }
    }
}