//
//  NotificationService.swift
//  NotificationService
//

import UserNotifications

class NotificationService: UNNotificationServiceExtension {

    var contentHandler: ((UNNotificationContent) -> Void)?
    var bestAttemptContent: UNMutableNotificationContent?

    override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        self.contentHandler = contentHandler
        bestAttemptContent = (request.content.mutableCopy() as? UNMutableNotificationContent)
        
        guard let bestAttemptContent = bestAttemptContent else {
            contentHandler(request.content)
            return
        }
        
        // 뱃지 설정 (aps에서 가져오거나 기본값 1)
        if let aps = request.content.userInfo["aps"] as? [String: Any],
           let badge = aps["badge"] as? Int {
            bestAttemptContent.badge = NSNumber(value: badge)
        }
        
        // FCM에서 전달된 이미지 URL 찾기
        var imageUrlString: String? = nil
        
        // 1. fcm_options.image 확인
        if let fcmOptions = request.content.userInfo["fcm_options"] as? [String: Any],
           let image = fcmOptions["image"] as? String {
            imageUrlString = image
        }
        
        // 2. data.image 확인
        if imageUrlString == nil,
           let data = request.content.userInfo["data"] as? [String: Any],
           let image = data["image"] as? String {
            imageUrlString = image
        }
        
        // 3. 직접 image 키 확인
        if imageUrlString == nil,
           let image = request.content.userInfo["image"] as? String {
            imageUrlString = image
        }
        
        // 4. notification.image 확인
        if imageUrlString == nil,
           let notification = request.content.userInfo["notification"] as? [String: Any],
           let image = notification["image"] as? String {
            imageUrlString = image
        }
        
        // 이미지 URL이 있으면 다운로드하여 첨부
        if let urlString = imageUrlString, let url = URL(string: urlString) {
            downloadImage(from: url) { attachment in
                if let attachment = attachment {
                    bestAttemptContent.attachments = [attachment]
                }
                contentHandler(bestAttemptContent)
            }
        } else {
            contentHandler(bestAttemptContent)
        }
    }
    
    override func serviceExtensionTimeWillExpire() {
        // 시간 초과 시 현재까지의 결과 전달
        if let contentHandler = contentHandler, let bestAttemptContent = bestAttemptContent {
            contentHandler(bestAttemptContent)
        }
    }
    
    // 이미지 다운로드 및 첨부 파일 생성
    private func downloadImage(from url: URL, completion: @escaping (UNNotificationAttachment?) -> Void) {
        let task = URLSession.shared.downloadTask(with: url) { localUrl, response, error in
            guard let localUrl = localUrl, error == nil else {
                print("NotificationService: Failed to download image - \(error?.localizedDescription ?? "Unknown error")")
                completion(nil)
                return
            }
            
            // MIME 타입에 따른 파일 확장자 결정
            var fileExtension = ".jpg"
            if let mimeType = response?.mimeType {
                switch mimeType {
                case "image/png":
                    fileExtension = ".png"
                case "image/gif":
                    fileExtension = ".gif"
                case "image/webp":
                    fileExtension = ".webp"
                default:
                    fileExtension = ".jpg"
                }
            }
            
            // 임시 파일로 복사 (UNNotificationAttachment는 특정 위치의 파일 필요)
            let tempDir = FileManager.default.temporaryDirectory
            let tempFile = tempDir.appendingPathComponent(UUID().uuidString + fileExtension)
            
            do {
                try FileManager.default.moveItem(at: localUrl, to: tempFile)
                let attachment = try UNNotificationAttachment(identifier: "image", url: tempFile, options: nil)
                completion(attachment)
            } catch {
                print("NotificationService: Failed to create attachment - \(error.localizedDescription)")
                completion(nil)
            }
        }
        task.resume()
    }
}
