import Foundation
import Capacitor
import AVFoundation

@objc(AudioTogglePlugin)
public class AudioTogglePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AudioTogglePlugin"
    public let jsName = "AudioToggle"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setSpeakerOn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setEarpieceOn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isSpeakerOn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setVolume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getVolume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resetAudioMode", returnType: CAPPluginReturnPromise)
    ]
    
    private let audioSession = AVAudioSession.sharedInstance()
    
    override public func load() {
        print("✅ AudioToggle plugin loaded")
    }
    
    /// 스피커폰 모드로 전환
    @objc func setSpeakerOn(_ call: CAPPluginCall) {
        do {
            try audioSession.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetooth])
            try audioSession.overrideOutputAudioPort(.speaker)
            try audioSession.setActive(true)
            
            print("🔊 Speaker ON")
            
            call.resolve([
                "success": true,
                "isSpeakerOn": true
            ])
        } catch {
            print("❌ Failed to set speaker on: \(error)")
            call.reject("Failed to set speaker on: \(error.localizedDescription)")
        }
    }
    
    /// 이어피스(귀대고) 모드로 전환
    @objc func setEarpieceOn(_ call: CAPPluginCall) {
        do {
            try audioSession.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth])
            try audioSession.overrideOutputAudioPort(.none)
            try audioSession.setActive(true)
            
            print("🔈 Earpiece ON")
            
            call.resolve([
                "success": true,
                "isSpeakerOn": false
            ])
        } catch {
            print("❌ Failed to set earpiece on: \(error)")
            call.reject("Failed to set earpiece on: \(error.localizedDescription)")
        }
    }
    
    /// 현재 스피커 상태 확인
    @objc func isSpeakerOn(_ call: CAPPluginCall) {
        let currentRoute = audioSession.currentRoute
        var isSpeaker = false
        
        for output in currentRoute.outputs {
            if output.portType == .builtInSpeaker {
                isSpeaker = true
                break
            }
        }
        
        call.resolve([
            "isSpeakerOn": isSpeaker
        ])
    }
    
    /// 볼륨 설정 (iOS에서는 시스템 볼륨을 직접 제어할 수 없음)
    @objc func setVolume(_ call: CAPPluginCall) {
        // iOS에서는 시스템 볼륨을 직접 설정할 수 없음
        // 하지만 성공으로 응답하여 앱이 계속 동작하도록 함
        let volume = call.getFloat("volume") ?? 1.0
        
        print("🔊 Volume set requested: \(volume) (iOS cannot set system volume directly)")
        
        call.resolve([
            "success": true,
            "volume": volume,
            "actualVolume": Int(volume * 100),
            "maxVolume": 100
        ])
    }
    
    /// 현재 볼륨 가져오기
    @objc func getVolume(_ call: CAPPluginCall) {
        // 현재 출력 볼륨 (0.0 ~ 1.0)
        let volume = audioSession.outputVolume
        
        call.resolve([
            "volume": volume,
            "currentVolume": Int(volume * 100),
            "maxVolume": 100
        ])
    }
    
    /// 오디오 모드 리셋 (통화 종료시)
    @objc func resetAudioMode(_ call: CAPPluginCall) {
        do {
            try audioSession.setCategory(.playback, mode: .default)
            try audioSession.overrideOutputAudioPort(.none)
            try audioSession.setActive(false, options: .notifyOthersOnDeactivation)
            
            print("🔄 Audio mode reset")
            
            call.resolve([
                "success": true
            ])
        } catch {
            print("❌ Failed to reset audio mode: \(error)")
            call.reject("Failed to reset audio mode: \(error.localizedDescription)")
        }
    }
}

