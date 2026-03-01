import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import { EyeIcon } from "lucide-react";

const StreamTopBanner = () => {
  return (
    <Carousel opts={{ loop: true }} className=''>
          <CarouselContent>
            <CarouselItem >
              <div className="relative w-full aspect-video rounded-xl overflow-hidden shadow-lg">
                <img
                  className="absolute inset-0 w-full h-full object-cover -z-10 blur-xs"
                  src="https://placehold.co/600x400?text=Stream+1"
                  alt="stream"
                />
                <div className="absolute inset-0 z-10 flex flex-col justify-between p-4 bg-gradient-to-t from-black/70 via-black/30 to-transparent">
                  <div className="flex items-center justify-between mb-2">
                    {/* 라이브 아이콘 및 방송 주제 */}
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1">
                        <span className="text-sm font-bold text-red-500 bg-white/70 px-2 py-0.5 rounded">LIVE</span>
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="md:text-base font-semibold text-white">
                      다이아갈때까지 노방종
                    </span>
                    <div className="flex items-center gap-2 justify-between">
                      <div>
                        <span className="text-sm md:text-sm font-semibold text-[#f4a8c2] bg-[#2f1b49]/60 px-2 py-1 rounded">
                          League of Legends
                        </span>
                      </div>
                      <div className="flex items-center gap-2 justify-end">
                        <EyeIcon className="w-4 h-4 text-white" />
                        <span className="text-sm text-white font-semibold">100</span>
                        <span className="text-sm md:text-md text-white rounded-full">
                          12/10 8:30
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CarouselItem>
            <CarouselItem >
            <div className="relative w-full aspect-video rounded-xl overflow-hidden shadow-lg">
                <img
                  className="absolute inset-0 w-full h-full object-cover -z-10 blur-xs"
                  src="https://placehold.co/600x400?text=Stream+1"
                  alt="stream"
                />
                <div className="absolute inset-0 z-10 flex flex-col justify-between p-4 bg-gradient-to-t from-black/70 via-black/30 to-transparent">
                  <div className="flex items-center justify-between mb-2">
                    {/* 라이브 아이콘 및 방송 주제 */}
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1">
                        <span className="text-sm font-bold text-red-500 bg-white/70 px-2 py-0.5 rounded">LIVE</span>
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="md:text-base font-semibold text-white">
                      다이아갈때까지 노방종
                    </span>
                    <div className="flex items-center gap-2 justify-between">
                      <div>
                        <span className="text-sm md:text-sm font-semibold text-[#f4a8c2] bg-[#2f1b49]/60 px-2 py-1 rounded">
                          League of Legends
                        </span>
                      </div>
                      <div className="flex items-center gap-2 justify-end">
                        <EyeIcon className="w-4 h-4 text-white" />
                        <span className="text-sm text-white font-semibold">100</span>
                        <span className="text-sm md:text-md text-white rounded-full">
                          05:44:32
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CarouselItem>
            <CarouselItem >
            <div className="relative w-full aspect-video rounded-xl overflow-hidden shadow-lg">
                <img
                  className="absolute inset-0 w-full h-full object-cover -z-10 blur-xs"
                  src="https://placehold.co/600x400?text=Stream+1"
                  alt="stream"
                />
                <div className="absolute inset-0 z-10 flex flex-col justify-between p-4 bg-gradient-to-t from-black/70 via-black/30 to-transparent">
                  <div className="flex items-center justify-between mb-2">
                    {/* 라이브 아이콘 및 방송 주제 */}
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1">
                        <span className="text-sm font-bold text-red-500 bg-white/70 px-2 py-0.5 rounded">LIVE</span>
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="md:text-base font-semibold text-white">
                      다이아갈때까지 노방종
                    </span>
                    <div className="flex items-center gap-2 justify-between">
                      <div>
                        <span className="text-sm md:text-sm font-semibold text-[#f4a8c2] bg-[#2f1b49]/60 px-2 py-1 rounded">
                          League of Legends
                        </span>
                      </div>
                      <div className="flex items-center gap-2 justify-end">
                        <EyeIcon className="w-4 h-4 text-white" />
                        <span className="text-sm text-white font-semibold">100</span>
                        <span className="text-sm md:text-md text-white rounded-full">
                          05:44:32
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CarouselItem>
          </CarouselContent>
        </Carousel>
  )
}

export default StreamTopBanner;