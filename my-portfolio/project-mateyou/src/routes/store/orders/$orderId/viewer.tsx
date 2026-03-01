import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { storeOrdersApi } from '@/api/store/orders';
import { storeDigitalApi } from '@/api/store/digital';
import type { StoreOrder } from '@/api/store/orders';
import { Button, Typography } from '@/components';
import { PageCurlGL } from '@/components/ui/PageCurlGL';

export const Route = createFileRoute('/store/orders/$orderId/viewer')({
  component: DigitalViewerPage,
});

interface DownloadItem {
  download_id: string;
  download_count: number;
  last_downloaded_at: string | null;
  expires_at: string | null;
  asset: {
    asset_id: string;
    file_name: string;
    file_url: string;
    display_order: number;
  };
}

type Dir = 1 | -1;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

// easeOutCubic
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

function animateSnap(opts: {
  from: number;
  to: number;
  duration: number;
  onUpdate: (v: number) => void;
  onComplete?: () => void;
}) {
  const { from, to, duration, onUpdate, onComplete } = opts;
  const t0 = performance.now();

  let raf = 0;
  const tick = (now: number) => {
    const t = clamp01((now - t0) / duration);
    const e = ease(t);
    const v = from + (to - from) * e;

    onUpdate(clamp01(v));

    if (t >= 1) {
      onUpdate(to);
      onComplete?.();
      return;
    }
    raf = requestAnimationFrame(tick);
  };

  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

/** ✅ 이미지 “깜빡임” 방지: decode 완료 후에만 화면 교체 */
async function decodeImage(url: string): Promise<{ width: number; height: number } | null> {
  if (!url) return null;
  try {
    const img = new Image();
    img.src = url;
    // 브라우저가 지원하면 decode()로 “완전 렌더 가능한 상태”까지 대기
    if ('decode' in img) await (img as any).decode();
    return { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height };
  } catch {
    return null;
  }
}

function DigitalViewerPage() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();
  const { user, isLoading: userLoading } = useAuth();

  const [order, setOrder] = useState<StoreOrder | null>(null);
  const [assets, setAssets] = useState<DownloadItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ✅ WebGL은 항상 마운트되어있고 opacity로만 보이게/숨김
  const [glActive, setGlActive] = useState(false);

  const [dir, setDir] = useState<Dir>(1);
  const dirRef = useRef<Dir>(1);

  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);

  const [grabX, setGrabX] = useState(0.88);
  const [grabY, setGrabY] = useState(0.5);

  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);

  const pointerIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const lastXRef = useRef(0);
  const lastTRef = useRef(0);
  const vxRef = useRef(0);
  const isHorizontalRef = useRef<boolean | null>(null);

  const animLockRef = useRef(false);
  const cancelAnimRef = useRef<null | (() => void)>(null);

  // ✅ 넘김 중 backUrl 프리즈(“빼꼼”/튐 제거)
  const frozenBackUrlRef = useRef<string>('');

  // ✅ “깜빡임 방지”용 표시 URL (decode 완료된 것만 표시)
  const [displayFrontUrl, setDisplayFrontUrl] = useState('');
  const [displayPreviewUrl, setDisplayPreviewUrl] = useState('');
  const frontTokenRef = useRef(0);
  const previewTokenRef = useRef(0);

  // 이미지 비율 (PageCurlGL에 전달)
  const [imageAspect, setImageAspect] = useState<number | undefined>(undefined);

  // tuning
  const SNAP_THRESHOLD = 0.33;
  const FLING_V = 0.85;
  const DRAG_SENS = 0.78;

  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      navigate({ to: '/login' });
      return;
    }
  }, [user?.id, userLoading, navigate]);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // 1. GET api-store-orders/$orderId 호출로 상세 정보 가져오기
        const orderResponse = await storeOrdersApi.getDetail(orderId);
        if (!orderResponse.success || !orderResponse.data) {
          throw new Error(orderResponse.error?.message || '주문을 불러오는데 실패했습니다.');
        }

        const orderData = orderResponse.data as StoreOrder;
        setOrder(orderData);

        // 2. order_items에서 디지털 상품인 아이템 찾기
        const digitalOrderItem = orderData.order_items?.find(item => {
          const itemProductType = item.product?.product_type || (item as any)?.product_type;
          return itemProductType === 'digital';
        });

        if (!digitalOrderItem) {
          throw new Error('디지털 상품을 찾을 수 없습니다.');
        }

        const itemStatus = (digitalOrderItem as any)?.status || orderData.status;

        if (!['paid', 'confirmed'].includes(itemStatus)) {
          throw new Error('결제가 완료된 주문만 볼 수 있습니다.');
        }

        // 3. 디지털 상품의 order_item_id로 GET api-store-digital/downloads?order_item_id= 호출
        const orderItemId = digitalOrderItem.order_item_id;
        if (!orderItemId) {
          throw new Error('주문 아이템 정보를 찾을 수 없습니다.');
        }
        const downloadsResponse = await storeDigitalApi.getDownloads({ order_item_id: orderItemId });
        if (!downloadsResponse.success || !downloadsResponse.data) {
          throw new Error(downloadsResponse.error?.message || '파일을 불러오는데 실패했습니다.');
        }

        const downloadsData = downloadsResponse.data as any;
        const downloadsList = downloadsData.downloads || [];

        const sortedDownloads = downloadsList.sort((a: DownloadItem, b: DownloadItem) =>
          (a.asset?.display_order || 0) - (b.asset?.display_order || 0)
        );

        setAssets(sortedDownloads);
      } catch (err: any) {
        setError(err.message || '데이터를 불러오는데 실패했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    if (orderId) fetchData();
  }, [orderId]);

  const pages = useMemo(() => assets.map(a => a.asset.file_url), [assets]);
  const hasNext = currentIndex < pages.length - 1;
  const hasPrev = currentIndex > 0;

  const canGoDir = (d: Dir) => (d === 1 ? hasNext : hasPrev);

  const computedBackUrl = useMemo(() => {
    if (!canGoDir(dir)) return '';
    return dir === 1 ? pages[currentIndex + 1] : pages[currentIndex - 1];
  }, [pages, currentIndex, dir, hasNext, hasPrev]);

  const frontUrl = pages[currentIndex] || '';
  const previewUrl = frozenBackUrlRef.current || computedBackUrl;

  /** ✅ “깜빡임 방지”:
   *  frontUrl이 바뀌어도 바로 교체하지 않고 decode 완료 후 displayFrontUrl만 교체
   */
  useEffect(() => {
    const run = async () => {
      const token = ++frontTokenRef.current;
      const next = frontUrl;
      if (!next) return;

      const size = await decodeImage(next);
      if (token !== frontTokenRef.current) return;

      setDisplayFrontUrl(next);
      if (size && size.width && size.height) {
        setImageAspect(size.width / size.height);
      }
    };
    run();
  }, [frontUrl]);

  /** ✅ 미리보기도 decode 완료된 것만 표시 (배경 깜빡임 제거) */
  useEffect(() => {
    const run = async () => {
      const token = ++previewTokenRef.current;
      const next = previewUrl || '';
      if (!next) {
        setDisplayPreviewUrl('');
        return;
      }

      await decodeImage(next);
      if (token !== previewTokenRef.current) return;

      setDisplayPreviewUrl(next);
    };
    run();
  }, [previewUrl]);

  /** ✅ 주변 페이지도 decode로 미리 준비 (페이지 교체 순간 깜빡임 최소화) */
  useEffect(() => {
    const run = async () => {
      const a = pages[currentIndex];
      const b = pages[currentIndex + 1];
      const c = pages[currentIndex - 1];
      // 병렬 pre-decode
      await Promise.all([decodeImage(a), decodeImage(b), decodeImage(c)]);
    };
    run();
  }, [pages, currentIndex]);

  const setProgressSafe = (v: number) => {
    const p = clamp01(v);
    progressRef.current = p;
    setProgress(p);
  };

  const stopAnim = () => {
    cancelAnimRef.current?.();
    cancelAnimRef.current = null;
    animLockRef.current = false;
  };

  const beginFreezeBack = () => {
    if (computedBackUrl) frozenBackUrlRef.current = computedBackUrl;
  };

  const clearFreezeBack = () => {
    frozenBackUrlRef.current = '';
  };

  const cancelFlip = () => {
    stopAnim();
    animLockRef.current = true;

    cancelAnimRef.current = animateSnap({
      from: progressRef.current,
      to: 0,
      duration: 160,
      onUpdate: setProgressSafe,
      onComplete: () => {
        setProgressSafe(0);
        setGlActive(false);
        setIsDragging(false);
        clearFreezeBack();
        animLockRef.current = false;
      },
    });
  };

  const finishFlip = (d: Dir) => {
    if (!canGoDir(d)) {
      cancelFlip();
      return;
    }

    stopAnim();
    animLockRef.current = true;

    cancelAnimRef.current = animateSnap({
      from: progressRef.current,
      to: 1,
      duration: 175,
      onUpdate: setProgressSafe,
      onComplete: () => {
        setProgressSafe(1);

        // ✅ 깜빡임 방지 핵심:
        // 1) GL을 먼저 꺼서 “검은 프레임”이 위로 올라오는 상황 제거
        // 2) 다음 인덱스의 front 이미지는 이미 decode되어 displayFrontUrl이 빠르게 따라옴
        setGlActive(false);

        requestAnimationFrame(() => {
          setCurrentIndex(prev => prev + d);
          setProgressSafe(0);
          setIsDragging(false);
          clearFreezeBack();
          animLockRef.current = false;
        });
      },
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (animLockRef.current) return;
    if (pointerIdRef.current != null) return;

    pointerIdRef.current = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const rect = containerRef.current?.getBoundingClientRect();
    const w = rect?.width || window.innerWidth;
    const h = rect?.height || window.innerHeight;

    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    lastXRef.current = e.clientX;
    lastTRef.current = performance.now();
    vxRef.current = 0;
    isHorizontalRef.current = null;

    // ✅ 드래그 시작 순간 “바로” 방향 선결정
    const guessedDir: Dir = e.clientX > w * 0.5 ? 1 : -1;
    dirRef.current = guessedDir;

    // ✅ 여기서 flushSync로 “그 프레임에” 캔버스 켜지게 만듦 (0.5초 딜레이 제거)
    flushSync(() => {
      setIsDragging(true);
      setDir(guessedDir);

      setGrabX(clamp(e.clientX / w, 0.02, 0.98));
      setGrabY(clamp(e.clientY / h, 0.02, 0.98));

      setGlActive(true); // ✅ 즉시 ON
      setProgressSafe(0.001); // ✅ 첫 프레임 곡률
    });

    beginFreezeBack();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointerIdRef.current !== e.pointerId) return;

    const rect = containerRef.current?.getBoundingClientRect();
    const w = rect?.width || window.innerWidth;
    const h = rect?.height || window.innerHeight;

    const dx = e.clientX - startXRef.current;
    const dy = e.clientY - startYRef.current;

    if (isHorizontalRef.current === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      isHorizontalRef.current = Math.abs(dx) > Math.abs(dy);
      if (!isHorizontalRef.current) {
        pointerIdRef.current = null;
        setIsDragging(false);
        setProgressSafe(0);
        setGlActive(false);
        clearFreezeBack();
        return;
      }
    }
    if (!isHorizontalRef.current) return;

    const now = performance.now();
    const dt = Math.max(1, now - lastTRef.current);
    const vx = (e.clientX - lastXRef.current) / dt;
    vxRef.current = vx;

    lastXRef.current = e.clientX;
    lastTRef.current = now;

    const nextDir: Dir = dx < 0 ? 1 : -1;

    if (dirRef.current !== nextDir) {
      dirRef.current = nextDir;
      setDir(nextDir);

      beginFreezeBack();
      setProgressSafe(0.001);
    }

    setGrabX(clamp(e.clientX / w, 0.02, 0.98));
    setGrabY(clamp(e.clientY / h, 0.02, 0.98));

    let p = Math.abs(dx) / (w * DRAG_SENS);

    if (nextDir === 1 && !hasNext) p *= 0.16;
    if (nextDir === -1 && !hasPrev) p *= 0.16;

    setProgressSafe(Math.max(0.001, p));
  };

  const onPointerUpOrCancel = (e: React.PointerEvent) => {
    if (pointerIdRef.current !== e.pointerId) return;

    pointerIdRef.current = null;
    setIsDragging(false);

    const p = progressRef.current;
    const vx = vxRef.current;
    const d = dirRef.current;

    const fling = (d === 1 && vx < -FLING_V) || (d === -1 && vx > FLING_V);

    if (p > SNAP_THRESHOLD || fling) finishFlip(d);
    else cancelFlip();
  };

  const onClick = (e: React.MouseEvent) => {
    if (animLockRef.current) return;

    const x = e.clientX;
    const w = window.innerWidth;

    if (x < w * 0.3 && hasPrev) {
      dirRef.current = -1;

      flushSync(() => {
        setDir(-1);
        setGrabX(0.12);
        setGrabY(0.5);
        setGlActive(true);
        setProgressSafe(0.001);
      });

      beginFreezeBack();
      finishFlip(-1);
      return;
    }

    if (x > w * 0.7 && hasNext) {
      dirRef.current = 1;

      flushSync(() => {
        setDir(1);
        setGrabX(0.88);
        setGrabY(0.5);
        setGlActive(true);
        setProgressSafe(0.001);
      });

      beginFreezeBack();
      finishFlip(1);
    }
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (animLockRef.current) return;

      if (e.key === 'ArrowLeft' && hasPrev) {
        dirRef.current = -1;

        flushSync(() => {
          setDir(-1);
          setGrabX(0.12);
          setGrabY(0.5);
          setGlActive(true);
          setProgressSafe(0.001);
        });

        beginFreezeBack();
        finishFlip(-1);
      } else if (e.key === 'ArrowRight' && hasNext) {
        dirRef.current = 1;

        flushSync(() => {
          setDir(1);
          setGrabX(0.88);
          setGrabY(0.5);
          setGlActive(true);
          setProgressSafe(0.001);
        });

        beginFreezeBack();
        finishFlip(1);
      } else if (e.key === 'Escape') {
        window.history.back();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [hasPrev, hasNext, orderId, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  if (error || !order || pages.length === 0) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="text-center">
          <Typography variant="h6" className="text-white mb-4">
            {error || '자산을 불러올 수 없습니다'}
          </Typography>
          <Button onClick={() => window.history.back()}>돌아가기</Button>
        </div>
      </div>
    );
  }

  // ✅ 표시용 URL: decode 완료된 것만 렌더 (깜빡임 제거)
  const safeFront = displayFrontUrl || frontUrl;
  const safePreview = displayPreviewUrl || previewUrl;

  return (
    <div className="fixed inset-0 bg-black z-50 overflow-hidden select-none">
      {/* 헤더 */}
      <div className="absolute top-0 left-0 right-0 z-40 bg-gradient-to-b from-black/70 to-transparent p-4 pointer-events-none">
        <div className="flex items-center justify-between pointer-events-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.history.back()}
            className="text-white hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </Button>
          <Typography variant="body2" className="text-white">
            {currentIndex + 1} / {pages.length}
          </Typography>
        </div>
      </div>

      {/* 뷰어 컨테이너 */}
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUpOrCancel}
        onPointerCancel={onPointerUpOrCancel}
        onClick={onClick}
      >
        {/* ✅ "다음 페이지" 미리보기(배경) */}
        {safePreview ? (
          <img
            src={safePreview}
            alt=""
            className="absolute inset-0 w-full h-full object-contain"
            draggable={false}
            style={{
              zIndex: 10,
              backfaceVisibility: 'hidden',
              transform: 'translateZ(0)',
              maxWidth: '100vw',
              maxHeight: '100vh',
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-black" style={{ zIndex: 10 }} />
        )}

        {/* ✅ 현재 페이지 정적 이미지(선명) — GL 켜지면 숨김 */}
        <img
          src={safeFront}
          alt=""
          className="absolute inset-0 w-full h-full object-contain"
          draggable={false}
          style={{
            zIndex: 20,
            opacity: glActive ? 0 : 1,
            transition: 'opacity 0ms',
            backfaceVisibility: 'hidden',
            transform: 'translateZ(0)',
            maxWidth: '100vw',
            maxHeight: '100vh',
          }}
        />

        {/* ✅ WebGL(넘김 페이지) */}
        <div
          className="absolute inset-0"
          style={{
            zIndex: 30,
            opacity: glActive ? 1 : 0,
            transition: 'opacity 0ms',
            pointerEvents: 'none',
            willChange: 'opacity',
            transform: 'translateZ(0)',
          }}
        >
          <PageCurlGL
            frontUrl={frontUrl}
            backUrl={previewUrl}
            progress={progress}
            dir={dir}
            grabX={grabX}
            grabY={grabY}
            isDragging={isDragging}
            strength={1.3}
            enabled={glActive}
            imageAspect={imageAspect}
          />
        </div>
      </div>
    </div>
  );
}

export default DigitalViewerPage;
