// 下载控制
import { EVT } from './EVT'
import { downloadArgument, DonwloadSuccessData } from './Download.d'
import { store } from './Store'
import { log } from './Log'
import { lang } from './Lang'
import { titleBar } from './TitleBar'
import { Colors } from './Colors'
import { ui } from './UI'

class DownloadControl {
  constructor() {
    this.createDownloadArea()

    window.addEventListener(EVT.events.crawlStart, () => {
      this.hideDownloadArea()
      this.reset()
    })

    window.addEventListener(EVT.events.crawlFinish, () => {
      this.showDownloadArea()
      this.beforeDownload()
    })

    window.addEventListener(EVT.events.convertChange, (ev: CustomEventInit) => {
      const count = ev.detail.data
      if (count > 0) {
        this.convertText = lang.transl('_转换任务提示', count.toString())
      } else {
        this.convertText = ''
      }
      this.convertTipEL.innerHTML = this.convertText
      this.LogDownloadProgress()
    })

    window.addEventListener(
      EVT.events.downloadSucccess,
      (ev: CustomEventInit) => {
        const data = ev.detail.data as DonwloadSuccessData
        this.downloadSuccess(data)
      }
    )

    window.addEventListener(EVT.events.downloadError, () => {
      this.reTryDownload()
    })
  }

  private readonly downloadThreadMax: number = 5 // 同时下载的线程数的最大值，也是默认值

  private downloadThread: number = this.downloadThreadMax // 同时下载的线程数

  private taskBatch = 0 // 标记任务批次，每次重新下载时改变它的值，传递给后台使其知道这是一次新的下载

  private downloadStatesList: number[] = [] // 标记每个下载任务的完成状态

  private downloaded: number = 0 // 已下载的任务数量

  private convertText = ''

  // 显示总的下载进度
  private showDownloadProgress(downloaded: number) {
    // 在总进度条上显示已下载数量
    document.querySelector('.downloaded')!.textContent = downloaded.toString()

    // 设置总进度条的进度
    const progress = (downloaded / store.result.length) * 100
    const progressBar = document.querySelector('.progress1')! as HTMLDivElement
    progressBar.style.width = progress + '%'
  }

  private set setDownloaded(val: number) {
    this.downloaded = val
    this.showDownloadProgress(this.downloaded)
    this.LogDownloadProgress()

    // 重置下载进度信息
    if (this.downloaded === 0) {
      this.resetDownloadArea()
    }

    // 下载完毕
    if (this.downloaded === store.result.length) {
      EVT.fire(EVT.events.downloadComplete)
      this.reset()
      this.setDownStateText(lang.transl('_下载完毕'))
      log.success(lang.transl('_下载完毕'), 2)
      titleBar.changeTitle('√')
    }
  }

  private downloadedAdd() {
    this.setDownloaded = this.downloaded + 1
  }

  private reTryTimer: number = 0 // 重试下载的定时器

  private downloadArea: HTMLDivElement = document.createElement('div') // 下载区域

  private downStatusEl: HTMLSpanElement = document.createElement('span')

  private convertTipEL: HTMLDivElement = document.createElement('div') // 转换动图时显示提示的元素

  private downloadStop: boolean = false // 是否停止下载

  private downloadPause: boolean = false // 是否暂停下载

  // 返回任务停止状态。暂停和停止都视为停止下载
  public get downloadStopped() {
    return this.downloadPause || this.downloadStop
  }

  // 显示或隐藏下载区域
  private showDownloadArea() {
    this.downloadArea.style.display = 'block'
  }

  private hideDownloadArea() {
    this.downloadArea.style.display = 'none'
  }

  // 重置下载区域的信息
  private resetDownloadArea() {
    this.setDownStateText(lang.transl('_未开始下载'))

    for (const el of document.querySelectorAll('.imgNum')) {
      el.textContent = store.result.length.toString()
    }

    for (const el of document.querySelectorAll('.download_fileName')) {
      el.textContent = ''
    }

    for (const el of document.querySelectorAll('.loaded')) {
      el.textContent = '0/0'
    }

    for (const el of document.querySelectorAll('.progress')) {
      ;(el as HTMLDivElement).style.width = '0%'
    }
  }

  // 设置下载状态文本，默认颜色为主题蓝色
  private setDownStateText(str: string, color: string = '') {
    const el = document.createElement('span')
    el.textContent = str
    if (color) {
      el.style.color = color
    }
    this.downStatusEl.innerHTML = ''
    this.downStatusEl.appendChild(el)
  }

  private reset() {
    this.downloadStatesList = []
    this.downloadPause = false
    this.downloadStop = false
    clearTimeout(this.reTryTimer)
  }

  private createDownloadArea() {
    const html = `<div class="download_area">
    <div class="centerWrap_btns">
    <button class="startDownload" type="button" style="background:${
      Colors.blue
    };"> ${lang.transl('_下载按钮1')}</button>
    <button class="pauseDownload" type="button" style="background:#e49d00;"> ${lang.transl(
      '_下载按钮2'
    )}</button>
    <button class="stopDownload" type="button" style="background:${
      Colors.red
    };"> ${lang.transl('_下载按钮3')}</button>
    <button class="copyUrl" type="button" style="background:${
      Colors.green
    };"> ${lang.transl('_下载按钮4')}</button>
    </div>
    <div class="centerWrap_down_tips">
    <p>
    ${lang.transl('_当前状态')}
    <span class="down_status blue"><span>${lang.transl(
      '_未开始下载'
    )}</span></span>
    <span class="convert_tip blue"></span>
    </p>
    <div class="progressBarWrap">
    <span class="text">${lang.transl('_下载进度')}</span>
    <div class="right1">
    <div class="progressBar progressBar1">
    <div class="progress progress1"></div>
    </div>
    <div class="progressTip progressTip1">
    <span class="downloaded">0</span>
    /
    <span class="imgNum">0</span>
    </div>
    </div>
    </div>
    </div>
    <div>
    <ul class="centerWrap_down_list">
    <li class="downloadBar">
    <div class="progressBar progressBar2">
    <div class="progress progress2"></div>
    </div>
    <div class="progressTip progressTip2">
    <span class="download_fileName"></span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${lang.transl(
      '_已下载'
    )}&nbsp;&nbsp;<span class="loaded">0/0</span>KB
    </div>
    </li>
    </ul>
    </div>
    </div>`

    ui.insertHTML(html)

    this.downloadArea = document.querySelector(
      '.download_area'
    ) as HTMLDivElement

    this.downStatusEl = document.querySelector(
      '.down_status '
    ) as HTMLSpanElement

    this.convertTipEL = document.querySelector(
      '.convert_tip'
    )! as HTMLDivElement

    document.querySelector('.startDownload')!.addEventListener('click', () => {
      this.startDownload()
    })

    document.querySelector('.pauseDownload')!.addEventListener('click', () => {
      this.pauseDownload()
    })

    document.querySelector('.stopDownload')!.addEventListener('click', () => {
      this.stopDownload()
    })

    document.querySelector('.copyUrl')!.addEventListener('click', () => {
      const text = this.showURLs()
      EVT.fire(EVT.events.output, text)
    })
  }

  // 显示 url
  private showURLs() {
    let result = ''
    result = store.result.reduce((total, now) => {
      return (total += now.url + '<br>')
    }, result)
    return result
  }

  // 所有下载进度条
  private allDownloadBar: NodeListOf<
    HTMLDivElement
  > = document.querySelectorAll('.downloadBar')

  // 重设下载进度条的数量
  private resetDownloadBar(num: number) {
    const centerWrapDownList = document.querySelector(
      '.centerWrap_down_list'
    ) as HTMLDivElement

    this.allDownloadBar = centerWrapDownList.querySelectorAll('.downloadBar')

    if (this.allDownloadBar.length !== num) {
      centerWrapDownList.innerHTML = this.allDownloadBar[0].outerHTML.repeat(
        num
      )
    }

    centerWrapDownList.style.display = 'block'

    // 缓存所有下载进度条元素
    this.allDownloadBar = centerWrapDownList.querySelectorAll('.downloadBar')
  }

  // 设置单个进度条的信息
  public setDownloadBar(
    index: number,
    name: string,
    loaded: number,
    total: number
  ) {
    const el = this.allDownloadBar[index]

    el.querySelector('.download_fileName')!.textContent = name

    const loadedBar = el.querySelector('.loaded') as HTMLDivElement
    loadedBar.textContent = `${Math.floor(loaded / 1024)}/${Math.floor(
      total / 1024
    )}`

    const progressBar = el.querySelector('.progress') as HTMLDivElement
    let progress = loaded / total
    if (isNaN(progress)) {
      progress = 0
    }
    progressBar.style.width = progress * 100 + '%'
  }

  // 抓取完毕之后，已经可以开始下载时，根据一些状态进行处理
  private beforeDownload() {
    this.setDownloaded = 0

    let autoDownload: boolean = ui.form.quietDownload.checked

    if (!autoDownload && !store.states.quickDownload) {
      titleBar.changeTitle('▶')
    }

    // 视情况自动开始下载
    if (autoDownload || store.states.quickDownload) {
      this.startDownload()
    }
  }

  // 开始下载
  private startDownload() {
    // 如果正在下载中，或无图片，则不予处理
    if (!store.states.allowWork || store.result.length === 0) {
      return
    }

    // 如果之前不是暂停状态，则需要重新下载
    if (!this.downloadPause) {
      this.setDownloaded = 0
      // 初始化下载记录
      // 状态：
      // -1 未使用
      // 0 使用中
      // 1 已完成
      this.downloadStatesList = new Array(store.result.length).fill(-1)
      this.taskBatch = new Date().getTime() // 修改本批下载任务的标记
    } else {
      // 继续下载
      // 把“使用中”的下载状态重置为“未使用”
      for (let index = 0; index < this.downloadStatesList.length; index++) {
        if (this.downloadStatesList[index] === 0) {
          this.downloadStatesList[index] = -1
        }
      }
    }

    // 下载线程设置
    const setThread = parseInt(ui.form.downloadThread.value)
    if (
      setThread < 1 ||
      setThread > this.downloadThreadMax ||
      isNaN(setThread)
    ) {
      // 如果数值非法，则重设为默认值
      this.downloadThread = this.downloadThreadMax
    } else {
      this.downloadThread = setThread // 设置为用户输入的值
    }

    // 如果剩余任务数量少于下载线程数
    if (store.result.length - this.downloaded < this.downloadThread) {
      this.downloadThread = store.result.length - this.downloaded
    }

    // 重设下载进度条的数量
    this.resetDownloadBar(this.downloadThread)

    // 重置一些条件
    EVT.fire(EVT.events.downloadStart)
    this.downloadPause = false
    this.downloadStop = false
    clearTimeout(this.reTryTimer)

    // 启动或继续下载，建立并发下载线程
    for (let i = 0; i < this.downloadThread; i++) {
      this.getDownloadData(i)
    }

    this.setDownStateText(lang.transl('_正在下载中'))

    log.log(lang.transl('_正在下载中'))
  }

  // 暂停下载
  private pauseDownload() {
    clearTimeout(this.reTryTimer)

    if (store.result.length === 0) {
      return
    }

    // 停止的优先级高于暂停。点击停止可以取消暂停状态，但点击暂停不能取消停止状态
    if (this.downloadStop === true) {
      return
    }

    if (this.downloadPause === false) {
      // 如果正在下载中
      if (!store.states.allowWork) {
        this.downloadPause = true // 发出暂停信号
        EVT.fire(EVT.events.downloadPause)

        titleBar.changeTitle('║')
        this.setDownStateText(lang.transl('_已暂停'), '#f00')
        log.warning(lang.transl('_已暂停'), 2)
      } else {
        // 不在下载中的话不允许启用暂停功能
        return
      }
    }
  }

  // 停止下载
  private stopDownload() {
    clearTimeout(this.reTryTimer)

    if (store.result.length === 0 || this.downloadStop) {
      return
    }

    this.downloadStop = true
    EVT.fire(EVT.events.downloadStop)

    titleBar.changeTitle('■')
    this.setDownStateText(lang.transl('_已停止'), '#f00')
    log.error(lang.transl('_已停止'), 2)
    this.downloadPause = false
  }

  // 重试下载
  private reTryDownload() {
    // 如果下载已经完成，则不执行操作
    if (this.downloaded === store.result.length) {
      return
    }
    // 暂停下载并在一定时间后重试下载
    this.pauseDownload()
    this.reTryTimer = window.setTimeout(() => {
      this.startDownload()
    }, 1000)
  }

  private downloadSuccess(data: DonwloadSuccessData) {
    // 更改这个任务状态为“已完成”
    this.setDownloadedIndex(data.index, 1)
    // 增加已下载数量
    this.downloadedAdd()
    // 是否继续下载
    const no = data.no
    if (this.checkContinueDownload()) {
      this.getDownloadData(no)
    }
  }

  // 设置已下载列表中的标记
  private setDownloadedIndex(index: number, value: -1 | 0 | 1) {
    this.downloadStatesList[index] = value
  }

  // 当一个文件下载完成后，检查是否还有后续下载任务
  private checkContinueDownload() {
    // 如果没有全部下载完毕
    if (this.downloaded < store.result.length) {
      // 如果任务已停止
      if (this.downloadPause || this.downloadStop) {
        return false
      }
      // 如果已完成的数量 加上 线程中未完成的数量，仍然没有达到文件总数，继续添加任务
      if (this.downloaded + this.downloadThread - 1 < store.result.length) {
        return true
      } else {
        return false
      }
    } else {
      return false
    }
  }

  // 在日志上显示下载进度
  private LogDownloadProgress() {
    let text = `${this.downloaded} / ${store.result.length}`

    // 追加转换动图的提示
    if (this.convertText) {
      text += ', ' + this.convertText
    }

    log.log(text, 2, false)
  }

  // 获取要下载的任务的编号
  private getDownloadData(progressBarNo: number) {
    let length = this.downloadStatesList.length
    let index: number | undefined
    for (let i = 0; i < length; i++) {
      if (this.downloadStatesList[i] === -1) {
        this.downloadStatesList[i] = 0
        index = i
        break
      }
    }

    if (index === undefined) {
      throw new Error('There are no data to download')
    } else {
      const data: downloadArgument = {
        data: store.result[index],
        index: index,
        progressBarNo: progressBarNo,
        taskBatch: this.taskBatch
      }
      EVT.fire(EVT.events.download, data)
    }
  }
}

const dlCtrl = new DownloadControl()
export { dlCtrl }