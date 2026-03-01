import UIKit
import Capacitor
import UserNotifications
import FirebaseCore
import FirebaseMessaging
import AVFoundation
import AppTrackingTransparency
import AdSupport
import PushKit
import CallKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Firebase 초기화
        FirebaseApp.configure()
        
        // Firebase Messaging 델리게이트 설정
        Messaging.messaging().delegate = self
        
        // 푸시 알림 델리게이트 설정
        UNUserNotificationCenter.current().delegate = self
        
        // VoIP 푸시는 LiveKitPlugin.load()에서 등록됨
        // 오디오 세션은 실제 통화 시작 시에만 설정 (LiveKitPlugin이 담당)
        print("✅ [AppDelegate] App launched")
        
        return true
    }
    
    func applicationDidBecomeActive(_ application: UIApplication) {
        print("📱 [AppDelegate] applicationDidBecomeActive called!")
        
        // 앱이 활성화될 때 ATT 권한 요청
        requestTrackingAuthorization()
        
        // 잠금 화면에서 CallKit 수락 후 Face ID 요청
        print("📱 [AppDelegate] Calling handleAppDidBecomeActive...")
        CallKitManager.shared.handleAppDidBecomeActive()
    }
    
    // MARK: - App Tracking Transparency
    
    private func requestTrackingAuthorization() {
        // iOS 14.5 이상에서만 ATT 권한 요청
        if #available(iOS 14.5, *) {
            ATTrackingManager.requestTrackingAuthorization { status in
                DispatchQueue.main.async {
                    switch status {
                    case .authorized:
                        print("✅ ATT: 사용자가 추적을 허용했습니다")
                        // IDFA 사용 가능
                        let idfa = ASIdentifierManager.shared().advertisingIdentifier.uuidString
                        print("📱 IDFA: \(idfa)")
                    case .denied:
                        print("❌ ATT: 사용자가 추적을 거부했습니다")
                    case .restricted:
                        print("⚠️ ATT: 추적이 제한되었습니다")
                    case .notDetermined:
                        print("⏳ ATT: 사용자가 아직 결정하지 않았습니다")
                    @unknown default:
                        print("❓ ATT: 알 수 없는 상태")
                    }
                }
            }
        }
    }
    
    // MARK: - Push Notifications
    
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        // APNs 토큰을 Firebase에 전달
        Messaging.messaging().apnsToken = deviceToken
        // Capacitor에도 전달
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }
    
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // 등록 실패 시 Capacitor에 전달
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // 백그라운드 오디오 세션은 CallKit/LiveKitPlugin이 통화 중일 때만 관리
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

// MARK: - UNUserNotificationCenterDelegate
extension AppDelegate: UNUserNotificationCenterDelegate {
    
    // 앱이 포그라운드에 있을 때 알림 표시
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .badge, .sound])
    }
    
    // 사용자가 알림을 탭했을 때
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        // Capacitor에 알림 탭 이벤트 전달
        NotificationCenter.default.post(name: Notification.Name("capacitorDidReceiveRemoteNotification"), object: response.notification.request.content.userInfo)
        completionHandler()
    }
}

// MARK: - MessagingDelegate (Firebase)
extension AppDelegate: MessagingDelegate {
    
    // FCM 토큰이 갱신되었을 때
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        print("📱 FCM Token: \(fcmToken ?? "nil")")
        
        // FCM 토큰을 Capacitor에 전달 (PushNotifications 플러그인이 이 토큰을 사용)
        if let token = fcmToken {
            let dataDict: [String: String] = ["token": token]
            NotificationCenter.default.post(
                name: Notification.Name("FCMToken"),
                object: nil,
                userInfo: dataDict
            )
        }
    }
}