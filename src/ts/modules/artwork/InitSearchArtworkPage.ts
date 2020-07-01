// 初始化 artwork 搜索页
import { InitPageBase } from '../InitPageBase'
import { Colors } from '../Colors'
import { lang } from '../Lang'
import { options } from '../Options'
import { pageInfo } from '../PageInfo'
import { DeleteWorks } from '../DeleteWorks'
import { EVT } from '../EVT'
import { SearchOption } from '../CrawlArgument'
import { FilterOption } from '../Filter.d'
import { filter } from '../Filter'
import { API } from '../API'
import { store } from '../Store'
import { log } from '../Log'
import { WorkInfo } from '../Store.d'
import { centerPanel } from '../CenterPanel'
import { titleBar } from '../TitleBar'
import { setting, form } from '../Settings'
import { FastScreen } from '../FastScreen'
import { DOM } from '../DOM'
import { BookmarkAllWorks } from '../BookmarkAllWorks'

type AddBMKData = {
  id: number
  tags: string[]
}

type FilterCB = (value: WorkInfo) => unknown

class InitSearchArtworkPage extends InitPageBase {
  constructor() {
    super()
    this.init()
    new FastScreen()
  }

  private readonly worksWrapSelector = '#root section ul'
  private readonly listClass = 'searchList'
  private readonly multipleClass = 'multiplePart'
  private readonly ugoiraClass = 'ugoiraPart'
  private readonly addBMKBtnClass = 'bmkBtn'
  private readonly bookmarkedClass = 'bookmarked'
  private readonly countSelector = 'section h3+div span'
  private readonly hotWorkAsideSelector = 'section aside'

  protected initElse() {
    this.hotBar()

    this.setPreviewResult(form.previewResult.checked)

    window.addEventListener(EVT.events.addResult, this.addWork)

    window.addEventListener('addBMK', this.addBookmark)

    window.addEventListener(EVT.events.crawlFinish, this.onCrawlFinish)

    window.addEventListener(EVT.events.crawlFinish, this.showCount)

    window.addEventListener(EVT.events.clearMultiple, this.clearMultiple)

    window.addEventListener(EVT.events.clearUgoira, this.clearUgoira)

    window.addEventListener(EVT.events.deleteWork, this.deleteWork)

    window.addEventListener(EVT.events.settingChange, this.onSettingChange)
  }

  // 去除热门作品上面的遮挡
  private hotBar() {
    // 因为热门作品里的元素是延迟加载的，所以使用定时器检查
    const timer = window.setInterval(() => {
      const hotWorkAside = document.querySelector(this.hotWorkAsideSelector)

      if (hotWorkAside) {
        window.clearInterval(timer)

        // 去掉遮挡作品的购买链接
        const premiumLink = hotWorkAside.nextSibling
        premiumLink && premiumLink.remove()

        // 去掉遮挡后两个作品的 after。因为是伪元素，所以要通过 css 控制
        const style = `
        section aside ul::after{
          display:none !important;
        }
        `
        DOM.addStyle(style)
      }
    }, 500)
  }

  protected appendCenterBtns() {
    DOM.addBtn('crawlBtns', Colors.green, lang.transl('_开始筛选'), [
      ['title', lang.transl('_开始筛选Title')],
    ]).addEventListener('click', () => {
      this.startScreen()
    })

    DOM.addBtn('crawlBtns', Colors.red, lang.transl('_在结果中筛选'), [
      ['title', lang.transl('_在结果中筛选Title')],
    ]).addEventListener('click', () => {
      this.screenInResult()
    })

    // 添加收藏本页所有作品的功能
    const bookmarkAll = new BookmarkAllWorks()
    bookmarkAll.btn.addEventListener('click', () => {
      const listWrap = this.getWorksWrap()
      if (listWrap) {
        const list = listWrap.querySelectorAll('li')
        bookmarkAll.setWorkList(list)
      }
    })
  }

  protected appendElseEl() {
    const deleteWorks = new DeleteWorks(`.${this.listClass}`)

    deleteWorks.addClearMultipleBtn(`.${this.multipleClass}`, () => {
      EVT.fire(EVT.events.clearMultiple)
    })

    deleteWorks.addClearUgoiraBtn(`.${this.ugoiraClass}`, () => {
      EVT.fire(EVT.events.clearUgoira)
    })

    deleteWorks.addManuallyDeleteBtn((el: HTMLElement) => {
      EVT.fire(EVT.events.deleteWork, el)
    })
  }

  protected setFormOption() {
    this.maxCount = 1000

    // 设置“个数/页数”选项
    options.setWantPage({
      text: lang.transl('_页数'),
      tip: lang.transl('_从本页开始下载提示'),
      rangTip: `1 - ${this.maxCount}`,
      value: this.maxCount.toString(),
    })
  }

  protected destroy() {
    DOM.clearSlot('crawlBtns')
    DOM.clearSlot('otherBtns')
    window.removeEventListener(EVT.events.addResult, this.addWork)
    window.removeEventListener(EVT.events.crawlFinish, this.onCrawlFinish)
    window.removeEventListener(EVT.events.crawlFinish, this.showCount)

    // 离开下载页面时，取消设置“不自动下载”
    store.states.notAutoDownload = false
  }

  private worksType = ''
  private option: SearchOption = {}
  private readonly worksNoPerPage = 60 // 每个页面有多少个作品
  private needCrawlPageCount = 0 // 一共有有多少个列表页面
  private sendCrawlTaskCount = 0 // 已经抓取了多少个列表页面
  private readonly allOption = [
    'order',
    'type',
    'wlt',
    'wgt',
    'hlt',
    'hgt',
    'ratio',
    'tool',
    's_mode',
    'mode',
    'scd',
    'ecd',
    'blt',
    'bgt',
  ]

  private resultMeta: WorkInfo[] = [] // 每次“开始筛选”完成后，储存当时所有结果，以备“在结果中筛选”使用

  private worksWrap: HTMLUListElement | null = null

  private deleteId = 0 // 手动删除时，要删除的作品的 id

  private crawlWorks = false // 是否在抓取作品数据（“开始筛选”时改为 true）

  private crawled = false // 是否已经进行过抓取

  private previewResult = true // 是否预览结果

  private optionsCauseResultChange = ['firstFewImagesSwitch', 'firstFewImages'] // 这些选项变更时，需要重新添加结果。例如多图作品“只下载前几张” firstFewImages 会影响生成的结果，但是过滤器 filter 不会检查，所以需要单独检测它的变更

  private needReAdd = false // 是否需要重新添加结果（并且会重新渲染）

  private startScreen() {
    if (!store.states.allowWork) {
      return alert(lang.transl('_当前任务尚未完成'))
    }

    this.crawlWorks = true

    this.readyCrawl()
  }

  protected async nextStep() {
    this.initFetchURL()

    this.needCrawlPageCount = await this.calcNeedCrawlPageCount()

    if (this.needCrawlPageCount === 0) {
      return this.noResult()
    }

    this.startGetIdList()

    this.clearWorks()
  }

  // 返回包含作品列表的 ul 元素
  private getWorksWrap() {
    const test = document.querySelectorAll(this.worksWrapSelector)
    if (test.length > 0) {
      if (test.length > 2) {
        // 大于 2 的情况是在搜索页的首页，或者小说页面
        return test[2] as HTMLUListElement
      }

      // 在插画、漫画、artworks 页面只有两个 ul 或者一个
      return test[test.length - 1] as HTMLUListElement
    }
    return null
  }

  private showCount = () => {
    const count = this.resultMeta.length.toString()
    log.success(lang.transl('_调整完毕', count))

    const countEl = document.querySelector(this.countSelector)
    if (countEl) {
      countEl.textContent = count
    }
  }

  private clearWorks() {
    this.worksWrap = this.getWorksWrap()

    if (!this.previewResult || !this.worksWrap) {
      return
    }

    this.worksWrap.innerHTML = ''
  }

  // 在页面显示作品
  private addWork = (event: CustomEventInit) => {
    if (!this.previewResult || !this.worksWrap) {
      return
    }

    const data = event.detail.data as WorkInfo

    let r18Text = ''
    if (data.tags.includes('R-18')) {
      r18Text = 'R-18'
    }

    if (data.tags.includes('R-18G')) {
      r18Text = 'R-18G'
    }

    let r18HTML = r18Text
      ? `
      <div class="r18Part">
        <div class="child">
          <div class="text">${r18Text}</div>
        </div>
      </div>`
      : ''

    let multipleHTML = ''
    if (data.pageCount > 1) {
      multipleHTML = `
        <div class="${this.multipleClass}">
          <div class="child">
            <span class="span1">
              <span class="span2">
              <svg viewBox="0 0 9 10" size="9" class="multipleSvg">
                <path d="M8,3 C8.55228475,3 9,3.44771525 9,4 L9,9 C9,9.55228475 8.55228475,10 8,10 L3,10
                C2.44771525,10 2,9.55228475 2,9 L6,9 C7.1045695,9 8,8.1045695 8,7 L8,3 Z M1,1 L6,1
                C6.55228475,1 7,1.44771525 7,2 L7,7 C7,7.55228475 6.55228475,8 6,8 L1,8 C0.44771525,8
                0,7.55228475 0,7 L0,2 C0,1.44771525 0.44771525,1 1,1 Z" transform=""></path>
                </svg>
              </span>
            </span>
            <span>${data.pageCount}</span>
          </div>  
        </div>
                    `
    }

    let ugoiraHTML = ''
    if (data.ugoiraInfo) {
      ugoiraHTML = `
        <svg viewBox="0 0 24 24" class="${this.ugoiraClass}" style="width: 48px; height: 48px;">
        <circle cx="12" cy="12" r="10" class="ugoiraCircle"></circle>
          <path d="M9,8.74841664 L9,15.2515834 C9,15.8038681 9.44771525,16.2515834 10,16.2515834
              C10.1782928,16.2515834 10.3533435,16.2039156 10.5070201,16.1135176 L16.0347118,12.8619342
              C16.510745,12.5819147 16.6696454,11.969013 16.3896259,11.4929799
              C16.3034179,11.3464262 16.1812655,11.2242738 16.0347118,11.1380658 L10.5070201,7.88648243
              C10.030987,7.60646294 9.41808527,7.76536339 9.13806578,8.24139652
              C9.04766776,8.39507316 9,8.57012386 9,8.74841664 Z"></path>
        </svg>`
    }

    // 添加收藏的作品，让收藏图标变红
    const bookmarkedFlag = data.bookmarked ? this.bookmarkedClass : ''

    const html = `
    <li class="${this.listClass}" data-id="${data.idNum}">
    <div class="searchContent">
      <div class="searchImgArea">
        <div width="184" height="184" class="searchImgAreaContent">
          <a target="_blank" class="imgAreaLink" href="/artworks/${data.idNum}">
            <!--顶部横幅-->
            <div class="topbar">

            <!--R-18 标记-->
            ${r18HTML}

            <!--多图作品标记-->
            ${multipleHTML}
              
            </div>
            <!--图片部分-->
            <div class="imgWrap">
            <img src="${data.thumb}" alt="${data.title}" style="object-fit: cover; object-position: center center;">
              <!-- 动图 svg -->
              ${ugoiraHTML}
              </div>
          </a>
          <!--添加显示收藏数-->
          <div class="bmkCount">${data.bmk}</div>
          <!--收藏按钮-->
          <div class="bmkBtnWrap">
            <div class="">
            <button type="button" class="${this.addBMKBtnClass}">
            <svg viewBox="0 0 1024 1024" width="32" height="32" class="bmkBtnSvg ${bookmarkedFlag}">
            <path d="M958.733019 411.348626 659.258367 353.59527 511.998465 85.535095 364.741633 353.59527 65.265958 411.348626 273.72878 634.744555 235.88794 938.463881 511.998465 808.479435 788.091594 938.463881 750.250754 634.744555Z" p-id="1106" class="path2"></path>
            <path d="M959.008 406.016l-308-47.008L512 64 372.992 359.008l-308 47.008 223.008 228-52.992 324L512 805.024l276.992 152.992-52.992-324zM512 740L304 856.992l40-235.008-179.008-182.016 242.016-32 104.992-224 104 224 240.992 34.016L680 622.976l36.992 235.008z" p-id="919"></path>
            </svg>
            </button>
            </div>
          </div>
        <!--收藏按钮结束-->
        </div>
      </div>
      <!--标题名-->
      <a target="_blank" class="titleLink" href="/artworks/${data.idNum}">${data.title}</a>
      <!--底部-->
      <div class="bottomBar">
      <!--作者信息-->
      <div class="userInfo">
      <!--相比原代码，这里去掉了作者头像的 html 代码。因为抓取到的数据里没有作者头像。-->
          <a target="_blank" href="/member.php?id=${data.userId}">
            <div class="userName">${data.user}</div>
          </a>
        </div>
      </div>
    </div>
  </li>
    `
    // 添加作品
    const li2 = document.createElement('li')
    li2.innerHTML = html
    const li = li2.children[0]
    this.worksWrap.appendChild(li)

    // 绑定收藏按钮的事件
    const addBMKBtn = li!.querySelector(
      `.${this.addBMKBtnClass}`
    ) as HTMLButtonElement
    const bookmarkedClass = this.bookmarkedClass
    addBMKBtn.addEventListener('click', function () {
      const e = new CustomEvent('addBMK', {
        detail: { data: { id: data.idNum, tags: data.tags } },
      })
      window.dispatchEvent(e)
      this.classList.add(bookmarkedClass)
    })
  }

  private addBookmark = (event: CustomEventInit) => {
    const data = event.detail.data as AddBMKData
    API.addBookmark(
      'illusts',
      data.id.toString(),
      data.tags,
      false,
      API.getToken()
    )
    this.resultMeta.forEach((result) => {
      if (result.idNum === data.id) {
        result.bookmarked = true
      }
    })
  }

  // “开始筛选”完成后，保存筛选结果的元数据，并重排结果
  private onCrawlFinish = () => {
    if (this.crawlWorks) {
      this.crawled = true
      this.resultMeta = [...store.resultMeta]
      this.reAddResult()
    }
  }

  // 传入函数，过滤符合条件的结果
  private async filterResult(callback: FilterCB) {
    if (!this.crawled) {
      return alert(lang.transl('_尚未开始筛选'))
    }
    if (this.resultMeta.length === 0) {
      return alert(lang.transl('_没有数据可供使用'))
    }

    centerPanel.close()

    log.clear()

    const nowLength = this.resultMeta.length // 储存过滤前的结果数量

    const resultMetaTemp: WorkInfo[] = []
    for await (const meta of this.resultMeta) {
      if (await callback(meta)) {
        resultMetaTemp.push(meta)
      }
    }

    this.resultMeta = resultMetaTemp

    // 如果过滤后，作品元数据发生了改变，或者强制要求重新生成结果，才会重排作品。以免浪费资源。
    if (this.resultMeta.length !== nowLength || this.needReAdd) {
      this.reAddResult()
    }

    this.needReAdd = false
    this.crawlWorks = false
    // 发布 crawlFinish 事件，会在日志上显示下载数量。
    EVT.fire(EVT.events.crawlFinish)
  }

  // 当筛选结果的元数据改变时，重新生成抓取结果
  private reAddResult() {
    store.resetResult()

    this.clearWorks()

    this.resultMeta.forEach((data) => {
      const dlCount = setting.getDLCount(data.pageCount)
      // 如果此时的 dlCount 与之前的 dlCount 不一样，则更新它
      if (dlCount !== data.dlCount) {
        data = Object.assign(data, { dlCount: dlCount })
      }

      store.addResult(data)
    })

    EVT.fire(EVT.events.worksUpdate)

    titleBar.change('→')
  }

  // 在当前结果中再次筛选，会修改第一次筛选的结果
  private screenInResult() {
    if (!store.states.allowWork) {
      return alert(lang.transl('_当前任务尚未完成'))
    }

    log.clear()

    filter.init()

    this.getMultipleSetting()

    this.filterResult((data) => {
      const filterOpt: FilterOption = {
        id: data.id,
        illustType: data.type,
        pageCount: data.pageCount,
        tags: data.tags,
        bookmarkCount: data.bmk,
        bookmarkData: data.bookmarked,
        width: data.fullWidth,
        height: data.fullHeight,
        createDate: data.date,
      }

      return filter.check(filterOpt)
    })
  }

  // 清除多图作品
  private clearMultiple = () => {
    this.filterResult((data) => {
      return data.pageCount <= 1
    })
  }

  // 清除动图作品
  private clearUgoira = () => {
    this.filterResult((data) => {
      return !data.ugoiraInfo
    })
  }

  // 手动删除作品
  private deleteWork = (event: CustomEventInit) => {
    const el = event.detail.data as HTMLElement
    this.deleteId = parseInt(el.dataset.id!)

    this.filterResult((data) => {
      return data.idNum !== this.deleteId
    })
  }

  protected getWantPage() {
    this.crawlNumber = this.checkWantPageInput(
      lang.transl('_从本页开始下载x页'),
      lang.transl('_下载所有页面')
    )

    if (this.crawlNumber === -1 || this.crawlNumber > this.maxCount) {
      this.crawlNumber = this.maxCount
    }
  }

  // 获取搜索页的数据。因为有多处使用，所以进行了封装
  private async getSearchData(p: number) {
    let data = await API.getSearchData(
      pageInfo.getPageTag,
      this.worksType,
      p,
      this.option
    )
    return data.body.illust || data.body.illustManga || data.body.manga
  }

  // 组织要请求的 url 中的参数
  private initFetchURL() {
    // 从 URL 中获取分类。可能有语言标识。
    /*
    https://www.pixiv.net/tags/Fate%2FGrandOrder/illustrations
    https://www.pixiv.net/en/tags/Fate%2FGrandOrder/illustrations
    */
    let URLType = location.pathname.split('tags/')[1].split('/')[1]
    // 但在“顶部”页面的时候是没有分类的，会是 undefined
    if (URLType === undefined) {
      URLType = ''
    }

    switch (URLType) {
      case '':
        this.worksType = 'artworks'
        break
      case 'illustrations':
      case 'illust_and_ugoira':
      case 'ugoira':
      case 'illust':
        this.worksType = 'illustrations'
        break
      case 'manga':
        this.worksType = 'manga'
        break

      default:
        this.worksType = 'artworks'
        break
    }

    let p = API.getURLSearchField(location.href, 'p')
    this.startpageNo = parseInt(p) || 1

    // 从页面 url 中获取可以使用的选项
    this.option = {}
    this.allOption.forEach((param) => {
      let value = API.getURLSearchField(location.href, param)
      if (value !== '') {
        this.option[param] = value
      }
    })
  }

  // 计算应该抓取多少页
  private async calcNeedCrawlPageCount() {
    let data = await this.getSearchData(1)
    // 计算总页数
    let pageCount = Math.ceil(data.total / this.worksNoPerPage)
    if (pageCount > this.maxCount) {
      // 最大为 1000
      pageCount = this.maxCount
    }
    // 计算从本页开始抓取的话，有多少页
    let needFetchPage = pageCount - this.startpageNo + 1
    // 比较用户设置的页数，取较小的那个数值
    if (needFetchPage < this.crawlNumber) {
      return needFetchPage
    } else {
      return this.crawlNumber
    }
  }

  // 计算页数之后，准备建立并发抓取线程
  private startGetIdList() {
    if (this.needCrawlPageCount <= this.ajaxThreadsDefault) {
      this.ajaxThreads = this.needCrawlPageCount
    } else {
      this.ajaxThreads = this.ajaxThreadsDefault
    }

    for (let i = 0; i < this.ajaxThreads; i++) {
      this.getIdList()
    }
  }

  protected async getIdList() {
    let p = this.startpageNo + this.sendCrawlTaskCount

    this.sendCrawlTaskCount++

    // 发起请求，获取列表页
    let data
    try {
      data = await this.getSearchData(p)
    } catch {
      this.getIdList()
      return
    }

    data = data.data

    for (const nowData of data) {
      // 排除广告信息
      if (nowData.isAdContainer) {
        continue
      }

      const filterOpt: FilterOption = {
        id: nowData.illustId,
        width: nowData.width,
        height: nowData.height,
        pageCount: nowData.pageCount,
        bookmarkData: nowData.bookmarkData,
        illustType: nowData.illustType,
        tags: nowData.tags,
      }

      if (await filter.check(filterOpt)) {
        store.idList.push({
          type: API.getWorkType(nowData.illustType),
          id: nowData.illustId,
        })
      }
    }

    this.listPageFinished++

    log.log(
      lang.transl('_列表页抓取进度', this.listPageFinished.toString()),
      1,
      false
    )

    if (this.sendCrawlTaskCount + 1 <= this.needCrawlPageCount) {
      // 继续发送抓取任务（+1 是因为 sendCrawlTaskCount 从 0 开始）
      this.getIdList()
    } else {
      // 抓取任务已经全部发送
      if (this.listPageFinished === this.needCrawlPageCount) {
        // 抓取任务全部完成
        log.log(lang.transl('_列表页抓取完成'))
        this.getIdListFinished()
      }
    }
  }

  protected resetGetIdListStatus() {
    this.listPageFinished = 0
    this.sendCrawlTaskCount = 0
  }

  // 搜索页把下载任务按收藏数从高到低下载
  protected sortResult() {
    store.resultMeta.sort(API.sortByProperty('bmk'))
    store.result.sort(API.sortByProperty('bmk'))
  }

  private onSettingChange = (event: CustomEventInit) => {
    const data = event.detail.data

    if (data.name === 'previewResult') {
      this.setPreviewResult(data.value)
    }

    if (this.optionsCauseResultChange.includes(data.name)) {
      this.needReAdd = true
    }
  }

  private setPreviewResult(value: boolean) {
    this.previewResult = value

    // 如果设置了“预览搜索结果”，则“不自动下载”。否则允许自动下载
    store.states.notAutoDownload = value ? true : false
  }
}

export { InitSearchArtworkPage }
