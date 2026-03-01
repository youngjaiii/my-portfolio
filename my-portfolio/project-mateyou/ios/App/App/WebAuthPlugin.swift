import Foundation
import Capacitor
import AuthenticationServices

@objc(WebAuthPlugin)
public class WebAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "WebAuthPlugin"
    public let jsName = "WebAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise)
    ]
    
    private var authSession: ASWebAuthenticationSession?
    
    @objc func authenticate(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"),
              let url = URL(string: urlString) else {
            call.reject("Invalid URL")
            return
        }
        
        let callbackScheme = call.getString("callbackScheme") ?? "capacitor"
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            
            self.authSession = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: callbackScheme
            ) { callbackURL, error in
                if let error = error as? ASWebAuthenticationSessionError {
                    if error.code == .canceledLogin {
                        call.reject("User cancelled")
                    } else {
                        call.reject("Auth error: \(error.localizedDescription)")
                    }
                    return
                }
                
                guard let callbackURL = callbackURL else {
                    call.reject("No callback URL")
                    return
                }
                
                call.resolve(["url": callbackURL.absoluteString])
            }
            
            self.authSession?.presentationContextProvider = self
            self.authSession?.prefersEphemeralWebBrowserSession = false
            self.authSession?.start()
        }
    }
    
    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return UIApplication.shared.windows.first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }
}







