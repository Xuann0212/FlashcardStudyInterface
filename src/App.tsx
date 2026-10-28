import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'

type Rating = 'got-it' | 'missed'
type Page = 'import' | 'settings' | 'study' | 'results'
type MaterialMode = 'file' | 'text'
type FileStatus = 'empty' | 'processing' | 'selected' | 'error'

type FileInfo = {
  name: string
  extension: string
  size: string
}

const cards = [
  { question: '线粒体在真核细胞中的主要功能是什么？', answer: '线粒体通过细胞呼吸产生真核细胞所需的大部分 ATP。' },
  { question: '真核细胞中的柠檬酸循环发生在哪里？', answer: '柠檬酸循环发生在线粒体基质中。' },
  { question: '细胞内主要的能量通货是哪种分子？', answer: 'ATP 是细胞使用的主要能量通货。' },
]

const steps: { id: Page; label: string }[] = [
  { id: 'import', label: '资料导入' },
  { id: 'settings', label: '生成设置' },
  { id: 'study', label: '闪卡学习' },
  { id: 'results', label: '学习结果' },
]

function Arrow({ direction }: { direction: 'left' | 'right' }) {
  return <span className="arrow-icon" aria-hidden="true">{direction === 'left' ? '←' : '→'}</span>
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function countEffectiveCharacters(text: string) {
  return Array.from(text.replace(/\s/g, '')).length
}

function loadStudyState() {
  if (typeof window === 'undefined') return null
  try {
    return JSON.parse(window.localStorage.getItem('fliply-study-state') ?? 'null') as {
      current?: number
      revealed?: Record<number, boolean>
      ratings?: Record<number, Rating>
    } | null
  } catch {
    return null
  }
}

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const savedStudyState = useRef(loadStudyState())
  const [page, setPage] = useState<Page>('import')
  const [materialMode, setMaterialMode] = useState<MaterialMode>('file')
  const [fileName, setFileName] = useState('')
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null)
  const [fileStatus, setFileStatus] = useState<FileStatus>('empty')
  const [fileError, setFileError] = useState('')
  const [materialText, setMaterialText] = useState('')
  const [importError, setImportError] = useState('')
  const [cardCount, setCardCount] = useState('12')
  const [difficulty, setDifficulty] = useState('中等')
  const [generationState, setGenerationState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [current, setCurrent] = useState(() => {
    const saved = savedStudyState.current?.current
    return typeof saved === 'number' && saved >= 0 && saved < cards.length ? saved : 0
  })
  const [revealed, setRevealed] = useState<Record<number, boolean>>(() => savedStudyState.current?.revealed ?? {})
  const [ratings, setRatings] = useState<Record<number, Rating>>(() => savedStudyState.current?.ratings ?? {})
  const [sourceOpen, setSourceOpen] = useState(false)
  const [retryMode, setRetryMode] = useState(false)
  const [retryCards, setRetryCards] = useState<number[]>([])

  const reviewedCount = Object.keys(ratings).length
  const gotItCount = Object.values(ratings).filter((value) => value === 'got-it').length
  const missedIndices = cards.map((_, index) => index).filter((index) => ratings[index] === 'missed')
  const remainingCount = cards.length - reviewedCount
  const studyIndices = retryMode && retryCards.length ? retryCards : cards.map((_, index) => index)
  const position = Math.max(0, studyIndices.indexOf(current))
  const isRevealed = Boolean(revealed[current])
  const rating = ratings[current]
  const progress = (reviewedCount / cards.length) * 100
  const mastery = reviewedCount ? Math.round((gotItCount / reviewedCount) * 1000) / 10 : null
  const status = useMemo(() => {
    if (rating === 'got-it') return '已掌握'
    if (rating === 'missed') return '未掌握'
    return '未评估'
  }, [rating])
  const textCharacterCount = useMemo(() => countEffectiveCharacters(materialText), [materialText])
  const hasValidTextLength = textCharacterCount >= 100 && textCharacterCount <= 5000
  const hasMaterial = materialMode === 'file' ? Boolean(fileName) && fileStatus === 'selected' : hasValidTextLength
  const isLastCard = position === studyIndices.length - 1
  const hasNextCard = position < studyIndices.length - 1

  useEffect(() => {
    window.localStorage.setItem('fliply-study-state', JSON.stringify({ current, revealed, ratings }))
  }, [current, revealed, ratings])

  useEffect(() => {
    const selector = '.primary-button, .reveal-button, .nav-button.primary, .continue-button'
    const handlePointerMove = (event: PointerEvent) => {
      const target = (event.target as Element).closest<HTMLElement>(selector)
      if (!target || target.matches(':disabled')) return
      const bounds = target.getBoundingClientRect()
      target.style.setProperty('--glow-x', `${event.clientX - bounds.left}px`)
      target.style.setProperty('--glow-y', `${event.clientY - bounds.top}px`)
      target.style.setProperty('--glow-opacity', '1')
    }
    const handlePointerOut = (event: PointerEvent) => {
      const target = (event.target as Element).closest<HTMLElement>(selector)
      if (!target || target.contains(event.relatedTarget as Node)) return
      target.style.setProperty('--glow-opacity', '0')
    }
    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerout', handlePointerOut)
    return () => {
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerout', handlePointerOut)
    }
  }, [])

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ''
    const extension = file.name.split('.').pop()?.toLowerCase()
    const nextFileInfo = {
      name: file.name,
      extension: (extension || '未知格式').toUpperCase(),
      size: formatFileSize(file.size),
    }
    setFileInfo(nextFileInfo)
    if (!['pdf', 'docx', 'txt'].includes(extension ?? '')) {
      setFileName('')
      setFileStatus('error')
      setFileError('不支持该文件格式')
      return
    }
    if (file.size === 0) {
      setFileName('')
      setFileStatus('error')
      setFileError('文件内容为空')
      return
    }
    setFileName(file.name)
    setFileStatus('selected')
    setFileError('')
  }

  const removeFile = () => {
    setFileName('')
    setFileInfo(null)
    setFileStatus('empty')
    setFileError('')
    if (inputRef.current) inputRef.current.value = ''
  }

  const continueToSettings = () => {
    if (materialMode === 'text' && !hasValidTextLength) {
      return
    }
    if (materialMode === 'file' && !fileName) {
      setImportError('请选择一份学习资料。')
      return
    }
    setImportError('')
    setPage('settings')
  }

  const generate = () => {
    setGenerationState('loading')
    window.setTimeout(() => {
      setGenerationState('idle')
      setRetryMode(false)
      setCurrent(0)
      setPage('study')
    }, 700)
  }

  const move = (offset: number) => {
    const nextPosition = position + offset
    if (nextPosition < 0 || nextPosition >= studyIndices.length) return
    setCurrent(studyIndices[nextPosition])
    setSourceOpen(false)
  }

  const rate = (value: Rating) => {
    if (!isRevealed) return
    setRatings((previous) => ({ ...previous, [current]: value }))
  }

  const retryMissed = () => {
    if (!missedIndices.length) return
    setRetryMode(true)
    setRetryCards(missedIndices)
    setCurrent(missedIndices[0])
    setSourceOpen(false)
    setPage('study')
  }

  const continueEvaluation = () => {
    const firstUnreviewed = cards.findIndex((_, index) => !ratings[index])
    if (firstUnreviewed < 0) return
    setRetryMode(false)
    setCurrent(firstUnreviewed)
    setSourceOpen(false)
    setPage('study')
  }

  return (
    <main className={`app-shell ${page === 'study' ? 'study-mode' : ''} ${page === 'import' ? 'import-mode' : ''}`}>
      <div className={`page-background ${page === 'study' ? 'study-background' : 'soft-background'}`} aria-hidden="true" />
      <header className="topbar">
        <button className="brand" type="button" aria-label="Fliply 首页" onClick={() => setPage('import')}>
          <span className="brand-mark" aria-hidden="true"><i /><i /></span>
          <span>Fliply</span>
        </button>

        <nav className="flow-steps" aria-label="学习流程">
          {steps.map((step, index) => (
            <span key={step.id} className={`${page === step.id ? 'active' : ''} ${steps.findIndex((item) => item.id === page) > index ? 'complete' : ''}`}>
              <i>{index + 1}</i>{step.label}
            </span>
          ))}
        </nav>

        <span />
      </header>

      {page === 'import' && (
        <section className="flow-page">
          <div className="page-heading">
            <p className="eyebrow">第 1 步</p>
            <h1>从一份学习资料开始</h1>
            <p>上传讲义、论文或笔记，制作属于你的学习闪卡。</p>
          </div>
          <section className="glass-panel import-panel">
            <div className={`segmented-control ${materialMode}`}>
              <button className={materialMode === 'file' ? 'active' : ''} onClick={() => { setMaterialMode('file'); setImportError('') }}>上传文件</button>
              <button className={materialMode === 'text' ? 'active' : ''} onClick={() => { setMaterialMode('text'); setImportError('') }}>粘贴文本</button>
            </div>

            {materialMode === 'file' ? (
              <div
                className={`upload-zone file-${fileStatus}`}
                onClick={() => fileStatus !== 'processing' && inputRef.current?.click()}
              >
                <input ref={inputRef} type="file" accept=".pdf,.docx,.txt" onChange={chooseFile} disabled={fileStatus === 'processing'} />
                {fileStatus === 'empty' && (
                  <>
                    <span className="upload-icon" aria-hidden="true">↑</span>
                    <strong>选择学习资料</strong>
                    <p>支持 PDF、DOCX、TXT</p>
                    <small className="upload-tip">建议使用可提取文字的文档</small>
                  </>
                )}
                {fileStatus === 'processing' && fileInfo && (
                  <div className="file-state">
                    <span className="file-type-icon" aria-hidden="true">{fileInfo.extension}</span>
                    <div className="file-copy">
                      <strong>{fileInfo.name}</strong>
                      <p>{fileInfo.extension} · {fileInfo.size}</p>
                      <span className="file-status processing"><i />正在解析文件……</span>
                      <small>正在提取文档中的文字</small>
                    </div>
                  </div>
                )}
                {fileStatus === 'selected' && fileInfo && (
                  <div className="file-state">
                    <span className="file-type-icon" aria-hidden="true">{fileInfo.extension}</span>
                    <div className="file-copy">
                      <strong>{fileInfo.name}</strong>
                      <p>{fileInfo.extension} · {fileInfo.size}</p>
                      <span className="file-status selected"><i />文件已选择</span>
                    </div>
                    <div className="file-actions">
                      <button type="button" onClick={(event) => { event.stopPropagation(); inputRef.current?.click() }}>更换</button>
                      <button type="button" onClick={(event) => { event.stopPropagation(); removeFile() }}>移除</button>
                    </div>
                  </div>
                )}
                {fileStatus === 'error' && (
                  <div className="file-state error-state" role="alert">
                    <span className="file-error-icon" aria-hidden="true">!</span>
                    <div className="file-copy">
                      <strong>{fileError}</strong>
                      <p>{fileError === '文件内容为空' ? '请选择包含学习内容的文件。' : fileError === '无法提取文件中的文字' ? '请尝试使用包含可复制文字的文档。' : '请选择 PDF、DOCX 或 TXT 文件。'}</p>
                      {fileInfo && <small>{fileInfo.name} · {fileInfo.size}</small>}
                    </div>
                    <button className="reselect-button" type="button" onClick={(event) => { event.stopPropagation(); inputRef.current?.click() }}>重新选择文件</button>
                  </div>
                )}
              </div>
            ) : (
              <textarea
                className="material-textarea"
                value={materialText}
                onChange={(event) => { setMaterialText(event.target.value); setImportError('') }}
                placeholder="在此粘贴需要学习的课程讲义、论文片段或学习笔记……"
                aria-label="学习资料文本"
              />
            )}

            {materialMode === 'text' && (
              <div className={`text-count ${textCharacterCount > 5000 ? 'over' : textCharacterCount >= 4000 ? 'near' : textCharacterCount > 0 && textCharacterCount < 100 ? 'low' : ''}`}>
                <div className="text-count-row">
                  <span>请输入 100–5000 字</span>
                  <span>已输入 {textCharacterCount} / 5000 字</span>
                </div>
                <p aria-live="polite">
                  {textCharacterCount > 5000
                    ? `已超出 ${textCharacterCount - 5000} 字，请删减后继续`
                    : textCharacterCount >= 4000
                      ? '接近字数上限'
                      : textCharacterCount > 0 && textCharacterCount < 100
                        ? `至少需要 100 字，还需输入 ${100 - textCharacterCount} 字`
                        : ''}
                </p>
              </div>
            )}
            <div className="panel-footer">
              <button className="primary-button" disabled={!hasMaterial} onClick={continueToSettings}>继续 <Arrow direction="right" /></button>
            </div>
          </section>
        </section>
      )}

      {page === 'settings' && (
        <section className="flow-page compact-page">
          <button className="page-back-button" type="button" onClick={() => setPage('import')}>
            <Arrow direction="left" />返回资料导入
          </button>
          <div className="page-heading">
            <p className="eyebrow">第 2 步</p>
            <h1>生成设置</h1>
            <p>选择你希望如何学习这份资料。</p>
          </div>
          <section className="glass-panel settings-panel">
            <div className="material-summary">
              <span className="document-icon" aria-hidden="true" />
              <div><small>已选资料</small><strong>{materialMode === 'file' ? fileName : '粘贴的文本资料'}</strong></div>
              <button onClick={() => setPage('import')}>更换资料</button>
            </div>
            <div className="setting-grid">
              <label>闪卡数量
                <select value={cardCount} onChange={(event) => setCardCount(event.target.value)}>
                  <option>6</option><option>12</option><option>18</option>
                </select>
              </label>
              <label>难度
                <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
                  <option>基础</option><option>中等</option><option>进阶</option>
                </select>
              </label>
            </div>
            <p className="setting-hint">如果资料内容不足，实际生成数量可能少于所选数量。</p>
            {generationState === 'loading' && <div className="generation-status"><span />正在生成闪卡……</div>}
            {generationState === 'error' && <div className="form-error">生成失败。<button onClick={generate}>重试</button></div>}
            <div className="panel-footer">
              <button className="primary-button" disabled={generationState === 'loading'} onClick={generate}>
                {generationState === 'loading' ? '正在生成……' : '生成闪卡'}
              </button>
            </div>
          </section>
        </section>
      )}

      {page === 'study' && (
        <section className="study-area">
          <button className="page-back-button study-back" type="button" onClick={() => setPage('settings')}>
            <Arrow direction="left" />返回生成设置
          </button>
          <div className="study-heading">
            <div><p className="eyebrow">第 3 步</p><h1>闪卡学习</h1></div>
            <div className="progress-panel" aria-label={`已评估 ${reviewedCount} / ${cards.length} 张`}>
              <div className="progress-copy"><span>已评估 <strong>{reviewedCount} / {cards.length}</strong></span><span>第 <strong>{position + 1} / {studyIndices.length}</strong> 张</span></div>
              <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
            </div>
          </div>
          <section className="card-stage" aria-live="polite">
            <div className={`flashcard ${isRevealed ? 'is-revealed' : ''}`}>
              <article className="card-face card-front">
                <div className="card-meta">
                  <span>问题 {position + 1}</span>
                  <span className={`status ${rating ?? 'unrated'}`}>{status}</span>
                </div>
                <p className="card-content">{cards[current].question}</p>
                <button className="reveal-button" onClick={() => setRevealed((previous) => ({ ...previous, [current]: true }))}>查看答案 <span className="eye-icon" aria-hidden="true" /></button>
              </article>
              <article className="card-face card-back">
                <div className="card-meta">
                  <span>答案</span>
                  <span className={`status ${rating ?? 'unrated'}`}>{status}</span>
                </div>
                <p className="card-content answer">{cards[current].answer}</p>
                <button className="reveal-button" onClick={() => setRevealed((previous) => ({ ...previous, [current]: false }))}>查看问题 <span className="question-icon" aria-hidden="true" /></button>
              </article>
            </div>
          </section>
          <div className="action-row">
            <p className="study-prompt">
              {!isRevealed ? '查看答案后，可评价自己的掌握情况' : rating ? '已记录评价，点击另一选项可修改' : '这道题你掌握了吗？'}
            </p>
            <div className="study-actions">
              <div className="rating-actions">
                <button className={`rating-button got-it ${rating === 'got-it' ? 'selected' : ''}`} disabled={!isRevealed} onClick={() => rate('got-it')}><span>✓</span>已掌握</button>
                <button className={`rating-button missed ${rating === 'missed' ? 'selected' : ''}`} disabled={!isRevealed} onClick={() => rate('missed')}><span>×</span>未掌握</button>
              </div>
              <button className="source-button" onClick={() => setSourceOpen((open) => !open)}><span className="document-icon" />{sourceOpen ? '收起原文' : '查看原文'}</button>
            </div>
          </div>
          {sourceOpen && (
            <section className="source-panel">
              <div className="source-heading"><div className="source-icon"><span /></div><div><p className="eyebrow">原文证据</p><h2>暂无可用的原文证据</h2></div></div>
              <p>当前卡片没有可验证的原文片段。连接真实资料解析后，此处仅展示实际来源内容。</p>
            </section>
          )}
          <div className="study-footer">
            {isLastCard && reviewedCount < cards.length && (
              <p className="navigation-status">还有 {cards.length - reviewedCount} 张卡片未评估</p>
            )}
            {isLastCard && reviewedCount === cards.length && (
              <p className="navigation-status complete"><span aria-hidden="true">✓</span>全部 {cards.length} 张卡片已评估，可以查看学习结果。</p>
            )}
            <nav className="card-navigation" aria-label="闪卡导航">
              <button className="nav-button secondary" disabled={position === 0} onClick={() => move(-1)}>
                <Arrow direction="left" />上一张
              </button>
              <div className="navigation-actions">
                <button className="nav-button primary" disabled={!hasNextCard} onClick={() => move(1)}>
                  下一张<Arrow direction="right" />
                </button>
                <button
                  className={`nav-button ${isLastCard && reviewedCount === cards.length ? 'primary' : 'secondary'} results-entry`}
                  onClick={() => setPage('results')}
                >
                  查看学习结果<Arrow direction="right" />
                </button>
              </div>
            </nav>
          </div>
        </section>
      )}

      {page === 'results' && (
        <section className="flow-page results-page">
          <button className="page-back-button" type="button" onClick={() => setPage('study')}>
            <Arrow direction="left" />返回闪卡学习
          </button>
          <div className="page-heading"><p className="eyebrow">第 4 步</p><h1>学习结果</h1><p>以下结果以每张卡片的最新一次评估为准。</p></div>
          <section className="glass-panel results-view">
            <div className="results-summary">
              <div><span>卡片总数</span><strong>{cards.length}</strong></div>
              <div><span>已评估卡片</span><strong>{reviewedCount}</strong></div>
              <div><span>已掌握</span><strong>{gotItCount}</strong></div>
              <div><span>未掌握</span><strong>{missedIndices.length}</strong></div>
            </div>
            <div className="result-bars">
              <div><p><span>学习进度</span><strong>{Math.round(progress)}%</strong></p><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><small>已评估卡片 / 卡片总数</small></div>
              <div><p><span>自评掌握率</span><strong>{mastery === null ? '—' : `${mastery}%`}</strong></p><div className="progress-track"><span style={{ width: `${mastery ?? 0}%` }} /></div><small>已掌握 / 已评估卡片</small></div>
            </div>
            {reviewedCount === 0 && (
              <div className="remaining-note"><strong>尚未评估卡片</strong><span>还有 {remainingCount} 张卡片等待评估。</span></div>
            )}
            {reviewedCount > 0 && reviewedCount < cards.length && (
              <div className="remaining-note"><strong>仍有未评估卡片</strong><span>还有 {remainingCount} 张卡片尚未评估。</span></div>
            )}
            {reviewedCount === cards.length && missedIndices.length > 0 && (
              <div className="remaining-note"><strong>已完成全部评估</strong><span>还有 {missedIndices.length} 张卡片未掌握，可以继续重练。</span></div>
            )}
            {reviewedCount === cards.length && missedIndices.length === 0 && (
              <div className="remaining-note"><strong>已完成全部评估</strong><span>所有卡片均已标记为掌握。</span></div>
            )}
            <div className="panel-footer result-actions">
              {missedIndices.length > 0 && (
                <button
                  className={remainingCount === 0 ? 'primary-button' : 'secondary-button'}
                  onClick={retryMissed}
                >
                  重练未掌握
                </button>
              )}
              {remainingCount > 0 && (
                <button className="primary-button" onClick={continueEvaluation}>
                  完成剩余卡片 <Arrow direction="right" />
                </button>
              )}
              {cards.length > 0 && (
                <button
                  className={remainingCount === 0 && missedIndices.length === 0 ? 'primary-button' : 'secondary-button'}
                  onClick={() => setPage('import')}
                >
                  导入新资料
                </button>
              )}
            </div>
          </section>
        </section>
      )}
    </main>
  )
}
