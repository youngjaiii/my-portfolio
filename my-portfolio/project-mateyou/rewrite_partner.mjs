import fs from 'fs'
const path = 'src/routes/partners/$memberCode.tsx'
const text = fs.readFileSync(path, 'utf8')
const needle = '  return (\r\n'
const idx = text.indexOf(needle)
if (idx === -1) {
  throw new Error('return block not found')
}
const pre = text.slice(0, idx)
const newBlock = `  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {isMobile && (
        <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <button
              className="inline-flex items-center gap-2 rounded-full py-2 text-sm font-semibold text-[#110f1a]"
              onClick={handleBack}
              aria-label="?�로가�?
            >
              <ChevronLeft className="h-5 w-5" />
              ?�로
            </button>
            <div className="flex flex-col items-center text-center">
              <img src="/logo.png" alt="MateYou 로고" className="h-6 w-auto" />
              <p className="mt-1 text-xs font-semibold text-[#110f1a]">
                @{partner?.member?.member_code ?? memberCode}
              </p>
            </div>
            <button
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#110f1a]"
              aria-label="멤버???�보"
            >
              <Crown className="h-5 w-5" />
            </button>
          </div>
        </header>
      )}

      <div className="mx-auto flex w-full max-w-6xl gap-4 px-4 py-8 lg:px-8">
        {!isMobile && (
          <div className="hidden lg:block">
            <FeedSideNavigation activeTab={activeFeedNav} onChange={handleFeedNavChange} />
          </div>
        )}
        <div className="flex-1">
          <div className="relative h-56 w-full overflow-hidden rounded-3xl">
            {heroImage ? (
              <img src={heroImage} alt="배경" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-gradient-to-r from-[#110f1a] via-[#40306d] to-[#7b5dff]" />
            )}
          </div>

          <div className="-mt-12 flex flex-col gap-6 rounded-3xl bg-white px-4 pb-16 shadow-sm lg:px-8">
            {!isMobile && (
              <div className="flex items-center justify-between border-b border-gray-100 pb-4 pt-6">
                <button
                  className="inline-flex items-center gap-2 rounded-full py-2 text-sm font-semibold text-[#110f1a]"
                  onClick={handleBack}
                  aria-label="?�로가�?
                >
                  <ChevronLeft className="h-5 w-5" />
                  ?�로
                </button>
                <p className="flex-1 text-center text-sm font-semibold text-[#110f1a]">
                  @{partner?.member?.member_code ?? memberCode}
                </p>
                <button
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#110f1a]"
                  aria-label="멤버???�보"
                >
                  <Crown className="h-5 w-5" />
                </button>
              </div>
            )}

            <section className="mt-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex flex-col gap-4">
                  <AvatarWithFallback
                    name={partner.partner_name || partner.member.name || partner.member.member_code || 'Unknown'}
                    src={partner.member.profile_image || undefined}
                    size="xl"
                    className="h-20 w-20 border-2 border-white shadow"
                  />
                  <div>
                    <Typography variant="h3" className="text-xl font-bold text-[#110f1a]">
                      {partner.partner_name || partner.member.name || partner.member.member_code}
                    </Typography>
                    <p className="text-sm text-gray-400">@{partner.member.member_code}</p>
                    {partner.partner_message && (
                      <p className="mt-4 text-sm text-gray-600">{partner.partner_message}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="mb-6 mt-6 flex flex-wrap gap-6 text-sm text-gray-600">
                <span>
                  <strong className="mr-1 text-[#110f1a]">{totalPosts}</strong>게시�?                </span>
                <span>
                  <strong className="mr-1 text-[#110f1a]">{followerCount.toLocaleString()}</strong>?�로??                </span>
                <span>
                  <strong className="mr-1 text-[#110f1a]">{followingCount.toLocaleString()}</strong>?�로??                </span>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="ghost"
                  className="min-w-[150px] flex-1 rounded-full !bg-black !text-white hover:!bg-black/90 focus:!ring-[#110f1a]"
                >
                  ?�로??                </Button>
                <Button
                  variant="outline"
                  className="min-w-[150px] flex-1 rounded-full border-[#110f1a] text-[#110f1a]"
                  onClick={handleQuickChat}
                >
                  메시지
                </Button>
              </div>
            </section>

            <div className="flex items-center gap-2 rounded-2xl bg-gray-100 p-1">
              {[
                { key: 'posts', label: '?�스?? },
                { key: 'membership', label: '멤버?? },
                { key: 'services', label: '?�비?? },
              ].map((tab) => (
                <button
                  key={tab.key}
                  className={`flex-1 rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                    activeTab === tab.key ? 'bg-white text-[#110f1a] shadow' : 'text-gray-500 hover:text-[#110f1a]'
                  }`}
                  onClick={() => setActiveTab(tab.key as 'posts' | 'membership' | 'services')}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'posts' && renderPostsContent()}
            {activeTab === 'membership' && renderMembershipContent()}
            {activeTab === 'services' && renderServiceContent()}
          </div>
        </div>
      </div>
    </div>
  )
}
`
fs.writeFileSync(path, pre + newBlock)