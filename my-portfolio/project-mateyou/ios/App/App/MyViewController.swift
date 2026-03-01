import UIKit
import Capacitor

class MyViewController: CAPBridgeViewController {
    
    private var bottomBg: UIView?
    private var keyboardHeight: CGFloat = 0
    private var safeTop: CGFloat = 0
    private var safeBottom: CGFloat = 0
    
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white
        
        webView?.scrollView.bounces = false
        webView?.scrollView.contentInsetAdjustmentBehavior = .never
        webView?.backgroundColor = .white
        webView?.isOpaque = false
        webView?.superview?.backgroundColor = .white
        
        // 키보드 radius 뒤 배경색
        if let window = view.window {
            window.backgroundColor = .white
        }
        
        NotificationCenter.default.addObserver(self, selector: #selector(keyboardWillShow(_:)), name: UIResponder.keyboardWillShowNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(keyboardWillHide(_:)), name: UIResponder.keyboardWillHideNotification, object: nil)
    }
    
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        
        safeTop = view.safeAreaInsets.top
        safeBottom = view.safeAreaInsets.bottom
        
        // 키보드 radius 뒤 배경색
        view.window?.backgroundColor = .white
        
        if bottomBg == nil, let webView = webView {
            let bot = UIView()
            bot.backgroundColor = .white
            bot.isUserInteractionEnabled = false
            webView.superview?.addSubview(bot)
            bottomBg = bot
        }
        
        applyLayout()
    }
    
    private func applyLayout() {
        guard let webView = webView else { return }
        
        // 전체 화면 크기 사용
        let screenBounds = UIScreen.main.bounds
        
        // 하단 SafeArea 배경
        if let bottomBg = bottomBg {
            bottomBg.frame = CGRect(x: 0, y: screenBounds.height - safeBottom, width: screenBounds.width, height: safeBottom)
            bottomBg.isHidden = keyboardHeight > 0
            bottomBg.superview?.bringSubviewToFront(bottomBg)
        }
        
        // WebView 프레임 - SafeArea 수동 적용
        let bottomOffset = keyboardHeight > 0 ? keyboardHeight : safeBottom
        webView.frame = CGRect(x: 0, y: safeTop, width: screenBounds.width, height: screenBounds.height - safeTop - bottomOffset)
        
        print("📐 screenH:\(screenBounds.height) safeTop:\(safeTop) bottomOffset:\(bottomOffset) → height:\(webView.frame.height)")
    }
    
    @objc private func keyboardWillShow(_ n: Notification) {
        guard let frame = n.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else { return }
        
        keyboardHeight = frame.height
        applyLayout()
        
        print("🔵 SHOW - webView.frame: \(webView?.frame ?? .zero)")
    }
    
    @objc private func keyboardWillHide(_ n: Notification) {
        keyboardHeight = 0
        applyLayout()
        
        print("🔴 HIDE - webView.frame: \(webView?.frame ?? .zero)")
    }
    
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
    
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(GalleryPlugin())
        bridge?.registerPluginInstance(InAppPurchasePlugin())
        bridge?.registerPluginInstance(AudioTogglePlugin())
        bridge?.registerPluginInstance(WebAuthPlugin())
        bridge?.registerPluginInstance(LiveKitPlugin())
    }
    
    deinit { NotificationCenter.default.removeObserver(self) }
}

