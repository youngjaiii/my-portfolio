/**
 * PDF를 이미지로 변환하는 유틸리티
 * pdfjs-dist 패키지를 사용하여 PDF를 이미지로 변환
 */

import * as pdfjsLib from 'pdfjs-dist';

// Worker 파일 경로를 한 번만 설정
let workerInitialized = false;
let workerUrlPromise: Promise<string> | null = null;

// Worker URL을 가져오는 함수
async function getWorkerUrl(): Promise<string> {
  if (workerUrlPromise) {
    return workerUrlPromise;
  }

  workerUrlPromise = (async () => {
    try {
      // Vite에서 Worker 파일을 직접 import하여 URL 가져오기
      const workerModule = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      return workerModule.default;
    } catch (error) {
      // Worker import 실패 시 unpkg CDN 사용 (fallback)
      console.warn('Worker 파일 import 실패, CDN 사용:', error);
      return `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
    }
  })();

  return workerUrlPromise;
}

// pdf.js를 초기화하는 함수
async function initializePdfJs() {
  if (typeof window === 'undefined' || workerInitialized) {
    return;
  }

  try {
    const workerSrc = await getWorkerUrl();
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
    workerInitialized = true;
  } catch (error: any) {
    console.error('PDF.js Worker 초기화 오류:', error);
    // 최후의 수단으로 CDN 사용
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
    workerInitialized = true;
  }
}

/**
 * PDF 파일을 이미지로 변환
 * @param pdfFile - PDF 파일
 * @param pageNumber - 변환할 페이지 번호 (기본값: 1)
 * @returns 이미지 File
 */
export async function convertPdfToImage(
  pdfFile: File,
  pageNumber: number = 1
): Promise<File> {
  try {
    await initializePdfJs();

    // PDF 파일을 ArrayBuffer로 읽기
    const arrayBuffer = await pdfFile.arrayBuffer();
    
    // PDF 로드 (Worker 실패 시 메인 스레드에서 처리)
    const loadingTask = pdfjsLib.getDocument({ 
      data: arrayBuffer,
      useWorkerFetch: false, // Worker fetch 비활성화
      verbosity: 0, // 로그 레벨 최소화
    });
    const pdf = await loadingTask.promise;
    
    // 첫 페이지 가져오기 (또는 지정된 페이지)
    const page = await pdf.getPage(Math.min(pageNumber, pdf.numPages));
    
    // 뷰포트 설정 (고해상도)
    const viewport = page.getViewport({ scale: 2.0 });
    
    // Canvas 생성
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (!context) {
      throw new Error('Canvas context를 생성할 수 없습니다.');
    }
    
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    // PDF 페이지를 Canvas에 렌더링
    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };
    
    await page.render(renderContext).promise;
    
    // Canvas를 Blob으로 변환
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            // 원본 파일명에서 확장자를 .png로 변경
            const fileName = pdfFile.name.replace(/\.pdf$/i, '.png');
            const imageFile = new File([blob], fileName, {
              type: 'image/png',
              lastModified: Date.now(),
            });
            resolve(imageFile);
          } else {
            reject(new Error('PDF를 이미지로 변환하는데 실패했습니다.'));
          }
        },
        'image/png',
        0.95
      );
    });
  } catch (error: any) {
    console.error('PDF 변환 오류:', error);
    throw new Error(`PDF 변환 실패: ${error.message}`);
  }
}

/**
 * PDF 파일의 첫 페이지를 미리보기 이미지로 변환 (썸네일용)
 * @param pdfFile - PDF 파일
 * @returns Data URL 문자열
 */
export async function convertPdfToPreviewImage(pdfFile: File): Promise<string> {
  try {
    await initializePdfJs();

    const arrayBuffer = await pdfFile.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ 
      data: arrayBuffer,
      useWorkerFetch: false, // Worker fetch 비활성화
      verbosity: 0, // 로그 레벨 최소화
    });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    
    // 미리보기용으로 작은 크기
    const viewport = page.getViewport({ scale: 1.0 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (!context) {
      throw new Error('Canvas context를 생성할 수 없습니다.');
    }
    
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };
    
    await page.render(renderContext).promise;
    
    const dataUrl = canvas.toDataURL('image/png', 0.8);
    return dataUrl;
  } catch (error: any) {
    console.error('PDF 미리보기 변환 오류:', error);
    throw new Error(`PDF 미리보기 변환 실패: ${error.message}`);
  }
}

