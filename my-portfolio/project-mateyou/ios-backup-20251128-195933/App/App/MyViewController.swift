import UIKit
import Capacitor

class MyViewController: CAPBridgeViewController {
    
    override open func capacitorDidLoad() {
        // 커스텀 플러그인 등록
        bridge?.registerPluginInstance(GalleryPlugin())
    }
}

