/**
 * VoiceRoomPasswordModal - 비공개 방 비밀번호 입력 모달
 */

import { Lock } from 'lucide-react'
import { useState } from 'react'

interface VoiceRoomPasswordModalProps {
  onSubmit: (password: string) => void
  onClose: () => void
  error: string | null
}

export function VoiceRoomPasswordModal({ 
  onSubmit, 
  onClose, 
  error 
}: VoiceRoomPasswordModalProps) {
  const [password, setPassword] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm mx-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
            <Lock className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-[#110f1a]">비공개 방</h3>
            <p className="text-sm text-gray-500">비밀번호를 입력해주세요</p>
          </div>
        </div>
        
        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">
            {error}
          </div>
        )}

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onSubmit(password.trim())
            }
          }}
          placeholder="비밀번호 입력"
          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl mb-4 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
          autoFocus
        />

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium text-gray-600 transition-colors"
          >
            취소
          </button>
          <button
            onClick={() => onSubmit(password.trim())}
            className="flex-1 py-3 bg-purple-500 hover:bg-purple-600 rounded-xl font-medium text-white transition-colors"
          >
            입장
          </button>
        </div>
      </div>
    </div>
  )
}

