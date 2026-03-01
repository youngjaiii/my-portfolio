import Foundation
import Capacitor
import Photos
import UIKit

@objc(GalleryPlugin)
public class GalleryPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GalleryPlugin"
    public let jsName = "Gallery"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getPhotos", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAlbums", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPhotosFromAlbum", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getVideoUrl", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getFullResolutionPhoto", returnType: CAPPluginReturnPromise)
    ]
    
    // 앨범 목록 가져오기
    @objc func getAlbums(_ call: CAPPluginCall) {
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        
        switch status {
        case .authorized, .limited:
            fetchAlbums(call: call)
        case .notDetermined:
            PHPhotoLibrary.requestAuthorization(for: .readWrite) { [weak self] newStatus in
                if newStatus == .authorized || newStatus == .limited {
                    self?.fetchAlbums(call: call)
                } else {
                    call.reject("Photos permission denied")
                }
            }
        case .denied, .restricted:
            call.reject("Photos permission denied")
        @unknown default:
            call.reject("Unknown authorization status")
        }
    }
    
    private func fetchAlbums(call: CAPPluginCall) {
        DispatchQueue.global(qos: .userInitiated).async {
            var albums: [[String: Any]] = []
            
            // 1. 최근 항목 (모든 사진)
            let allPhotosOptions = PHFetchOptions()
            allPhotosOptions.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
            let allPhotos = PHAsset.fetchAssets(with: allPhotosOptions)
            
            albums.append([
                "id": "all",
                "title": "최근 항목",
                "count": allPhotos.count,
                "type": "smartAlbum"
            ])
            
            // 2. 스마트 앨범 (즐겨찾기, 스크린샷 등)
            let smartAlbums = PHAssetCollection.fetchAssetCollections(
                with: .smartAlbum,
                subtype: .any,
                options: nil
            )
            
            smartAlbums.enumerateObjects { (collection, _, _) in
                let assetCount = PHAsset.fetchAssets(in: collection, options: nil).count
                if assetCount > 0 {
                    let title = collection.localizedTitle ?? "Unknown"
                    // 중복 방지 (최근 항목은 이미 추가함)
                    if collection.assetCollectionSubtype != .smartAlbumUserLibrary {
                        albums.append([
                            "id": collection.localIdentifier,
                            "title": title,
                            "count": assetCount,
                            "type": "smartAlbum"
                        ])
                    }
                }
            }
            
            // 3. 사용자 앨범
            let userAlbums = PHAssetCollection.fetchAssetCollections(
                with: .album,
                subtype: .any,
                options: nil
            )
            
            userAlbums.enumerateObjects { (collection, _, _) in
                let assetCount = PHAsset.fetchAssets(in: collection, options: nil).count
                if assetCount > 0 {
                    albums.append([
                        "id": collection.localIdentifier,
                        "title": collection.localizedTitle ?? "Unknown",
                        "count": assetCount,
                        "type": "userAlbum"
                    ])
                }
            }
            
            DispatchQueue.main.async {
                call.resolve(["albums": albums])
            }
        }
    }
    
    // 특정 앨범에서 사진 가져오기 (페이지네이션 지원)
    @objc func getPhotosFromAlbum(_ call: CAPPluginCall) {
        let albumId = call.getString("albumId") ?? "all"
        let offset = call.getInt("offset") ?? 0
        let limit = call.getInt("limit") ?? 50
        let thumbnailWidth = call.getInt("thumbnailWidth") ?? 300
        let thumbnailHeight = call.getInt("thumbnailHeight") ?? 300
        
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        
        switch status {
        case .authorized, .limited:
            fetchPhotosFromAlbum(albumId: albumId, offset: offset, limit: limit, thumbnailWidth: thumbnailWidth, thumbnailHeight: thumbnailHeight, call: call)
        case .notDetermined:
            PHPhotoLibrary.requestAuthorization(for: .readWrite) { [weak self] newStatus in
                if newStatus == .authorized || newStatus == .limited {
                    self?.fetchPhotosFromAlbum(albumId: albumId, offset: offset, limit: limit, thumbnailWidth: thumbnailWidth, thumbnailHeight: thumbnailHeight, call: call)
                } else {
                    call.reject("Photos permission denied")
                }
            }
        case .denied, .restricted:
            call.reject("Photos permission denied")
        @unknown default:
            call.reject("Unknown authorization status")
        }
    }
    
    private func fetchPhotosFromAlbum(albumId: String, offset: Int, limit: Int, thumbnailWidth: Int, thumbnailHeight: Int, call: CAPPluginCall) {
        DispatchQueue.global(qos: .userInitiated).async {
            let fetchOptions = PHFetchOptions()
            fetchOptions.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
            
            var assets: PHFetchResult<PHAsset>
            var totalCount: Int = 0
            
            if albumId == "all" {
                // 모든 사진
                assets = PHAsset.fetchAssets(with: fetchOptions)
                totalCount = assets.count
            } else {
                // 특정 앨범
                let collections = PHAssetCollection.fetchAssetCollections(
                    withLocalIdentifiers: [albumId],
                    options: nil
                )
                
                if let collection = collections.firstObject {
                    assets = PHAsset.fetchAssets(in: collection, options: fetchOptions)
                    totalCount = assets.count
                } else {
                    DispatchQueue.main.async {
                        call.reject("Album not found")
                    }
                    return
                }
            }
            
            var photos: [[String: Any]] = []
            let imageManager = PHImageManager.default()
            let targetSize = CGSize(width: thumbnailWidth, height: thumbnailHeight)
            let options = PHImageRequestOptions()
            options.isSynchronous = true
            options.deliveryMode = .highQualityFormat
            options.resizeMode = .exact
            options.isNetworkAccessAllowed = true
            
            let semaphore = DispatchSemaphore(value: 0)
            
            // 페이지네이션 적용
            let startIndex = min(offset, assets.count)
            let endIndex = min(offset + limit, assets.count)
            
            for i in startIndex..<endIndex {
                let asset = assets.object(at: i)
                let isVideo = asset.mediaType == .video
                
                // 썸네일 이미지 가져오기
                imageManager.requestImage(for: asset, targetSize: targetSize, contentMode: .aspectFill, options: options) { image, info in
                    defer { semaphore.signal() }
                    
                    guard let image = image,
                          let imageData = image.jpegData(compressionQuality: 0.85) else {
                        return
                    }
                    
                    let base64String = imageData.base64EncodedString()
                    
                    var photoDict: [String: Any] = [
                        "identifier": asset.localIdentifier,
                        "data": base64String,
                        "creationDate": asset.creationDate?.iso8601String ?? "",
                        "duration": isVideo ? asset.duration : 0,
                        "fullWidth": asset.pixelWidth,
                        "fullHeight": asset.pixelHeight,
                        "thumbnailWidth": Int(image.size.width),
                        "thumbnailHeight": Int(image.size.height),
                        "mediaType": isVideo ? "video" : "photo"
                    ]
                    
                    photos.append(photoDict)
                }
                
                semaphore.wait()
            }
            
            let hasMore = endIndex < totalCount
            
            DispatchQueue.main.async {
                call.resolve([
                    "photos": photos,
                    "totalCount": totalCount,
                    "hasMore": hasMore,
                    "offset": offset,
                    "limit": limit
                ])
            }
        }
    }
    
    // 기존 getPhotos 유지 (하위 호환)
    @objc func getPhotos(_ call: CAPPluginCall) {
        let quantity = call.getInt("quantity") ?? 100
        let thumbnailWidth = call.getInt("thumbnailWidth") ?? 300
        let thumbnailHeight = call.getInt("thumbnailHeight") ?? 300
        
        // 권한 확인
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        
        switch status {
        case .authorized, .limited:
            fetchPhotos(quantity: quantity, thumbnailWidth: thumbnailWidth, thumbnailHeight: thumbnailHeight, call: call)
        case .notDetermined:
            PHPhotoLibrary.requestAuthorization(for: .readWrite) { [weak self] newStatus in
                if newStatus == .authorized || newStatus == .limited {
                    self?.fetchPhotos(quantity: quantity, thumbnailWidth: thumbnailWidth, thumbnailHeight: thumbnailHeight, call: call)
                } else {
                    call.reject("Photos permission denied")
                }
            }
        case .denied, .restricted:
            call.reject("Photos permission denied")
        @unknown default:
            call.reject("Unknown authorization status")
        }
    }
    
    private func fetchPhotos(quantity: Int, thumbnailWidth: Int, thumbnailHeight: Int, call: CAPPluginCall) {
        DispatchQueue.global(qos: .userInitiated).async {
            let fetchOptions = PHFetchOptions()
            fetchOptions.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
            fetchOptions.fetchLimit = quantity
            
            let assets = PHAsset.fetchAssets(with: fetchOptions)
            
            var photos: [[String: Any]] = []
            let imageManager = PHImageManager.default()
            let targetSize = CGSize(width: thumbnailWidth, height: thumbnailHeight)
            let options = PHImageRequestOptions()
            options.isSynchronous = true
            options.deliveryMode = .highQualityFormat
            options.resizeMode = .exact
            options.isNetworkAccessAllowed = true
            
            let semaphore = DispatchSemaphore(value: 0)
            
            assets.enumerateObjects { (asset, index, stop) in
                if index >= quantity {
                    stop.pointee = true
                    return
                }
                
                imageManager.requestImage(for: asset, targetSize: targetSize, contentMode: .aspectFill, options: options) { image, info in
                    defer { semaphore.signal() }
                    
                    guard let image = image,
                          let imageData = image.jpegData(compressionQuality: 0.85) else {
                        return
                    }
                    
                    let base64String = imageData.base64EncodedString()
                    let isVideo = asset.mediaType == .video
                    
                    let photoDict: [String: Any] = [
                        "identifier": asset.localIdentifier,
                        "data": base64String,
                        "creationDate": asset.creationDate?.iso8601String ?? "",
                        "duration": isVideo ? asset.duration : 0,
                        "fullWidth": asset.pixelWidth,
                        "fullHeight": asset.pixelHeight,
                        "thumbnailWidth": Int(image.size.width),
                        "thumbnailHeight": Int(image.size.height),
                        "mediaType": isVideo ? "video" : "photo"
                    ]
                    
                    photos.append(photoDict)
                }
                
                semaphore.wait()
            }
            
            DispatchQueue.main.async {
                call.resolve(["photos": photos])
            }
        }
    }
    
    // 비디오 URL 가져오기
    @objc func getVideoUrl(_ call: CAPPluginCall) {
        guard let identifier = call.getString("identifier") else {
            call.reject("identifier is required")
            return
        }
        
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        
        switch status {
        case .authorized, .limited:
            fetchVideoUrl(identifier: identifier, call: call)
        case .notDetermined:
            PHPhotoLibrary.requestAuthorization(for: .readWrite) { [weak self] newStatus in
                if newStatus == .authorized || newStatus == .limited {
                    self?.fetchVideoUrl(identifier: identifier, call: call)
                } else {
                    call.reject("Photos permission denied")
                }
            }
        case .denied, .restricted:
            call.reject("Photos permission denied")
        @unknown default:
            call.reject("Unknown authorization status")
        }
    }
    
    private func fetchVideoUrl(identifier: String, call: CAPPluginCall) {
        DispatchQueue.global(qos: .userInitiated).async {
            let fetchResult = PHAsset.fetchAssets(withLocalIdentifiers: [identifier], options: nil)
            
            guard let asset = fetchResult.firstObject, asset.mediaType == .video else {
                DispatchQueue.main.async {
                    call.reject("Video not found")
                }
                return
            }
            
            let options = PHVideoRequestOptions()
            options.version = .current
            options.deliveryMode = .automatic
            options.isNetworkAccessAllowed = true
            
            PHImageManager.default().requestAVAsset(forVideo: asset, options: options) { avAsset, audioMix, info in
                DispatchQueue.main.async {
                    if let urlAsset = avAsset as? AVURLAsset {
                        // 파일 URL을 capacitor 스키마로 변환하여 웹뷰에서 접근 가능하게 함
                        let fileUrl = urlAsset.url.absoluteString
                        call.resolve([
                            "url": fileUrl,
                            "duration": asset.duration,
                            "width": asset.pixelWidth,
                            "height": asset.pixelHeight
                        ])
                    } else if let composition = avAsset as? AVComposition {
                        // 슬로우 모션 등 편집된 비디오의 경우 임시 파일로 내보내기
                        let exportSession = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality)
                        let tempUrl = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".mp4")
                        
                        exportSession?.outputURL = tempUrl
                        exportSession?.outputFileType = .mp4
                        
                        exportSession?.exportAsynchronously {
                            DispatchQueue.main.async {
                                if exportSession?.status == .completed {
                                    call.resolve([
                                        "url": tempUrl.absoluteString,
                                        "duration": asset.duration,
                                        "width": asset.pixelWidth,
                                        "height": asset.pixelHeight
                                    ])
                                } else {
                                    call.reject("Failed to export video")
                                }
                            }
                        }
                    } else {
                        call.reject("Failed to get video URL")
                    }
                }
            }
        }
    }
    
    // 고화질 이미지 가져오기 (업로드용)
    @objc func getFullResolutionPhoto(_ call: CAPPluginCall) {
        guard let identifier = call.getString("identifier") else {
            call.reject("identifier is required")
            return
        }
        
        let quality = call.getDouble("quality") ?? 0.9
        let maxWidth = call.getInt("maxWidth") ?? 2048
        let maxHeight = call.getInt("maxHeight") ?? 2048
        
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        
        switch status {
        case .authorized, .limited:
            fetchFullResolutionPhoto(identifier: identifier, quality: quality, maxWidth: maxWidth, maxHeight: maxHeight, call: call)
        case .notDetermined:
            PHPhotoLibrary.requestAuthorization(for: .readWrite) { [weak self] newStatus in
                if newStatus == .authorized || newStatus == .limited {
                    self?.fetchFullResolutionPhoto(identifier: identifier, quality: quality, maxWidth: maxWidth, maxHeight: maxHeight, call: call)
                } else {
                    call.reject("Photos permission denied")
                }
            }
        case .denied, .restricted:
            call.reject("Photos permission denied")
        @unknown default:
            call.reject("Unknown authorization status")
        }
    }
    
    private func fetchFullResolutionPhoto(identifier: String, quality: Double, maxWidth: Int, maxHeight: Int, call: CAPPluginCall) {
        DispatchQueue.global(qos: .userInitiated).async {
            let fetchResult = PHAsset.fetchAssets(withLocalIdentifiers: [identifier], options: nil)
            
            guard let asset = fetchResult.firstObject else {
                DispatchQueue.main.async {
                    call.reject("Photo not found")
                }
                return
            }
            
            // 비디오인 경우 처리
            if asset.mediaType == .video {
                self.exportVideoAsFile(asset: asset, call: call)
                return
            }
            
            // 이미지 요청 옵션
            let options = PHImageRequestOptions()
            options.isSynchronous = true
            options.deliveryMode = .highQualityFormat
            options.resizeMode = .exact
            options.isNetworkAccessAllowed = true
            
            // 원본 크기 또는 최대 크기로 제한
            let targetWidth = min(asset.pixelWidth, maxWidth)
            let targetHeight = min(asset.pixelHeight, maxHeight)
            let targetSize = CGSize(width: targetWidth, height: targetHeight)
            
            let semaphore = DispatchSemaphore(value: 0)
            var resultData: Data?
            var resultMimeType = "image/jpeg"
            
            PHImageManager.default().requestImage(for: asset, targetSize: targetSize, contentMode: .aspectFit, options: options) { image, info in
                defer { semaphore.signal() }
                
                guard let image = image else { return }
                
                // JPEG로 압축
                if let jpegData = image.jpegData(compressionQuality: CGFloat(quality)) {
                    resultData = jpegData
                    resultMimeType = "image/jpeg"
                }
            }
            
            semaphore.wait()
            
            guard let data = resultData else {
                DispatchQueue.main.async {
                    call.reject("Failed to get image data")
                }
                return
            }
            
            let base64String = data.base64EncodedString()
            
            DispatchQueue.main.async {
                call.resolve([
                    "data": base64String,
                    "mimeType": resultMimeType,
                    "width": asset.pixelWidth,
                    "height": asset.pixelHeight,
                    "size": data.count
                ])
            }
        }
    }
    
    private func exportVideoAsFile(asset: PHAsset, call: CAPPluginCall) {
        let options = PHVideoRequestOptions()
        options.version = .current
        options.deliveryMode = .highQualityFormat
        options.isNetworkAccessAllowed = true
        
        PHImageManager.default().requestExportSession(forVideo: asset, options: options, exportPreset: AVAssetExportPresetHighestQuality) { exportSession, info in
            guard let exportSession = exportSession else {
                DispatchQueue.main.async {
                    call.reject("Failed to create export session")
                }
                return
            }
            
            let tempUrl = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".mp4")
            exportSession.outputURL = tempUrl
            exportSession.outputFileType = .mp4
            
            exportSession.exportAsynchronously {
                DispatchQueue.main.async {
                    if exportSession.status == .completed {
                        // 파일 데이터를 base64로 변환
                        if let videoData = try? Data(contentsOf: tempUrl) {
                            let base64String = videoData.base64EncodedString()
                            call.resolve([
                                "data": base64String,
                                "mimeType": "video/mp4",
                                "width": asset.pixelWidth,
                                "height": asset.pixelHeight,
                                "size": videoData.count,
                                "duration": asset.duration
                            ])
                            
                            // 임시 파일 삭제
                            try? FileManager.default.removeItem(at: tempUrl)
                        } else {
                            call.reject("Failed to read video data")
                        }
                    } else {
                        call.reject("Failed to export video: \(exportSession.error?.localizedDescription ?? "Unknown error")")
                    }
                }
            }
        }
    }
}

extension Date {
    var iso8601String: String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: self)
    }
}

