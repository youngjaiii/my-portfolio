#!/usr/bin/env python3
"""
Toss Payments 암호화 스크립트
Python의 authlib.jose를 사용하여 Toss Payments API 요청을 암호화합니다.
"""
import sys
import json
import binascii
import uuid
from datetime import datetime
from authlib.jose import JsonWebEncryption

def hex_decode(hex_str):
    """16진수 문자열을 바이트로 변환"""
    return binascii.unhexlify(hex_str)

def encrypt(target, security_key):
    """
    Toss Payments API 요청 암호화
    
    Args:
        target: 암호화할 JSON 객체 (dict)
        security_key: 64자리 16진수 보안 키 문자열
    
    Returns:
        JWE 암호화된 문자열
    """
    # 보안 키 바이트로 전환
    key = hex_decode(security_key)
    
    # JWE 헤더 생성
    headers = {
        "alg": "dir",
        "enc": "A256GCM",
        "iat": datetime.now().astimezone().isoformat(),
        "nonce": str(uuid.uuid4())
    }
    
    # Request Body 암호화
    jwe = JsonWebEncryption()
    encrypted = jwe.serialize_compact(headers, json.dumps(target).encode('utf-8'), key)
    
    return encrypted

def decrypt(encrypted_jwe, hex_key):
    """
    Toss Payments API 응답 복호화
    
    Args:
        encrypted_jwe: JWE 암호화된 문자열
        hex_key: 64자리 16진수 보안 키 문자열
    
    Returns:
        복호화된 JSON 문자열
    """
    # 보안 키 바이트로 전환
    key = hex_decode(hex_key)
    
    # JWE 응답 복호화
    jwe = JsonWebEncryption()
    decrypted = jwe.deserialize_compact(encrypted_jwe, key)
    
    return decrypted['payload'].decode('utf-8')

def main():
    """메인 함수: stdin에서 JSON을 읽어서 암호화/복호화 결과를 stdout으로 출력"""
    try:
        # stdin에서 입력 읽기
        input_data = json.load(sys.stdin)
        
        action = input_data.get('action', 'encrypt')  # encrypt 또는 decrypt
        security_key = input_data.get('securityKey')
        
        if not security_key:
            print(json.dumps({"error": "securityKey is required"}), file=sys.stderr)
            sys.exit(1)
        
        if action == 'encrypt':
            payload = input_data.get('payload')
            if not payload:
                print(json.dumps({"error": "payload is required for encryption"}), file=sys.stderr)
                sys.exit(1)
            
            # 암호화 실행
            encrypted = encrypt(payload, security_key)
            
            # 결과 출력
            result = {
                "encrypted": encrypted,
                "success": True
            }
            print(json.dumps(result))
            
        elif action == 'decrypt':
            encrypted_jwe = input_data.get('encrypted')
            if not encrypted_jwe:
                print(json.dumps({"error": "encrypted is required for decryption"}), file=sys.stderr)
                sys.exit(1)
            
            # 복호화 실행
            decrypted_text = decrypt(encrypted_jwe, security_key)
            
            # JSON 파싱 시도
            try:
                decrypted_data = json.loads(decrypted_text)
            except json.JSONDecodeError:
                # JSON이 아니면 문자열로 반환
                decrypted_data = decrypted_text
            
            # 결과 출력
            result = {
                "decrypted": decrypted_data,
                "success": True
            }
            print(json.dumps(result))
            
        else:
            print(json.dumps({"error": f"Unknown action: {action}. Use 'encrypt' or 'decrypt'"}), file=sys.stderr)
            sys.exit(1)
        
    except Exception as e:
        error_result = {
            "error": str(e),
            "success": False
        }
        print(json.dumps(error_result), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()

