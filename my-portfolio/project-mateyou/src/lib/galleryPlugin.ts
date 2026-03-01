import { registerPlugin } from '@capacitor/core'

export interface GalleryPhoto {
  identifier: string
  data: string // base64 encoded
  creationDate: string
  duration: number
  fullWidth: number
  fullHeight: number
  thumbnailWidth: number
  thumbnailHeight: number
  mediaType: 'photo' | 'video'
}

export interface GalleryAlbum {
  id: string
  title: string
  count: number
  type: 'smartAlbum' | 'userAlbum'
}

export interface GetPhotosOptions {
  quantity?: number
  thumbnailWidth?: number
  thumbnailHeight?: number
}

export interface GetPhotosResult {
  photos: GalleryPhoto[]
}

export interface GetAlbumsResult {
  albums: GalleryAlbum[]
}

export interface GetPhotosFromAlbumOptions {
  albumId: string
  offset?: number
  limit?: number
  thumbnailWidth?: number
  thumbnailHeight?: number
}

export interface GetPhotosFromAlbumResult {
  photos: GalleryPhoto[]
  totalCount: number
  hasMore: boolean
  offset: number
  limit: number
}

export interface GetVideoUrlOptions {
  identifier: string
}

export interface GetVideoUrlResult {
  url: string
  duration: number
  width: number
  height: number
}

export interface GetFullResolutionPhotoOptions {
  identifier: string
  quality?: number // 0.0 ~ 1.0, default 0.9
  maxWidth?: number // default 2048
  maxHeight?: number // default 2048
}

export interface GetFullResolutionPhotoResult {
  data: string // base64 encoded
  mimeType: string // 'image/jpeg' or 'video/mp4'
  width: number
  height: number
  size: number // bytes
  duration?: number // video only
}

export interface GalleryPlugin {
  getPhotos(options?: GetPhotosOptions): Promise<GetPhotosResult>
  getAlbums(): Promise<GetAlbumsResult>
  getPhotosFromAlbum(options: GetPhotosFromAlbumOptions): Promise<GetPhotosFromAlbumResult>
  getVideoUrl(options: GetVideoUrlOptions): Promise<GetVideoUrlResult>
  getFullResolutionPhoto(options: GetFullResolutionPhotoOptions): Promise<GetFullResolutionPhotoResult>
}

const Gallery = registerPlugin<GalleryPlugin>('Gallery')

export { Gallery }
