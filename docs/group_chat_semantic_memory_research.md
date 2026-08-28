# 多人聊天室的語意分流、意圖辨識與可信記憶：研究到 BoboBot 的實作方案

> 查核日期：2026-08-28。研究來源以原始論文、ACL/AAAI/ACM/NeurIPS 官方頁面與官方程式碼為主。引用數是 Semantic Scholar 或 OpenAlex 的近似快照；資料庫合併預印本與正式版的方式不同，因此只用來判斷影響力級距，不應跨平台精確排名。OpenAlex 的 `cited_by_count` 定義與查詢方式見[官方 Works 文件](https://help.openalex.org/data/works/)。

## 結論先講

目前問題不是單純「記憶找得不夠準」，而是四個不同問題被交給同一次 Gemini 生成處理：

1. **這句話屬於哪一段對話？**（conversation disentanglement）
2. **誰在對誰說、正在做什麼語用行為？**（speaker/addressee + dialogue act）
3. **該取回哪一類記憶或即時資料？**（intent-aware retrieval）
4. **取回的內容是誰的說法、已驗證事實，還是模型舊回答？**（provenance + grounding）

最適合 BoboBot 的方向不是先訓練大型模型，而是建立一條可觀測的管線：

`訊息正規化 → reply-to/thread 分流 → 呼叫者與意圖分類 → 限定範圍檢索 → 事實工具查核 → 有證據生成 → 寫入候選記憶`

其中 Discord 的明確回覆、mention、股票代號等結構訊號應當優先於語意相似度；模型只在結構訊號不足時補判。以案例「6515」而言，**數字代號應先由確定性的台股代號表解析為欣興，再交給 Gemini 分析**，不能讓近期聊天中的「美光」主題或舊模型輸出參與實體映射。

## 文獻地圖與可實作重點

| 面向 | 原始工作 | 約略引用證據（2026-08-28） | 對本專案可移植的做法 |
|---|---|---:|---|
| 對話拆線 | [Elsner & Charniak, *You Talking to Me?* (ACL 2008)](https://aclanthology.org/P08-1095/) | Semantic Scholar 約 136；[紀錄頁](https://www.semanticscholar.org/paper/A-Large-Scale-Corpus-for-Conversation-Kummerfeld-Gouravajhala/c59d36e79d573cc4a2440cb2a7154eada5c0ead2) | 把訊息看成圖節點，用時間、說話者、名稱提及、詞彙/語意相似度預測 reply-to 邊，再由圖得到 thread，而非直接塞固定 50 則訊息。 |
| 對話拆線資料與評測 | [Kummerfeld et al., *A Large-Scale Corpus for Conversation Disentanglement* (ACL 2019)](https://aclanthology.org/P19-1374/) | Semantic Scholar 約 106；[紀錄頁](https://www.semanticscholar.org/paper/A-Large-Scale-Corpus-for-Conversation-Kummerfeld-Gouravajhala/c59d36e79d573cc4a2440cb2a7154eada5c0ead2) | 77,563 則人工標註訊息與 reply-structure graph；論文指出常用語料中 89% 對話有漏訊息或混入額外訊息，正好說明「取最近 N 則」會污染上下文。官方頁另附資料與程式。 |
| 說話者關係圖 | [Ghosal et al., *DialogueGCN* (EMNLP-IJCNLP 2019)](https://aclanthology.org/D19-1015/) | Semantic Scholar 約 628；[紀錄頁](https://www.semanticscholar.org/paper/2bb65d63ec27900d21bf119f895214499253661a) | 雖原任務是情緒辨識，但 self-speaker / inter-speaker 圖邊很適合表示「同一人延續」與「不同人回應」。MVP 可先把這些關係做成手工特徵。 |
| 多人對話預訓練 | [Gu et al., *MPC-BERT* (ACL 2021)](https://aclanthology.org/2021.acl-long.285/) | OpenAlex 約 43；[紀錄](https://openalex.org/W3177271673) | 同時學 reply-to utterance、identical speaker、pointer consistency、addressee 與 response selection。這是最貼近「誰說什麼給誰」的任務拆法，可作為碩論模型或後續 fine-tune 藍圖。 |
| 語用意圖 | [Stolcke et al., *Dialogue Act Modeling…* (Computational Linguistics 2000)](https://aclanthology.org/J00-3003/) | Semantic Scholar 約 1,191；[關聯紀錄](https://www.semanticscholar.org/paper/Speaker-Turn-Modeling-for-Dialogue-Act-He-Tavabi/935147e13b5c368989b3867b518a544418ca979e) | 將 statement、question、agreement、disagreement、backchannel 等視為序列標籤。BoboBot 可再加 `invoke_ai`、`ask_stock_fact`、`ask_memory`、`correct_bot`、`casual_chat`。 |
| 說話者狀態 | [Majumder et al., *DialogueRNN* (AAAI 2019)](https://ojs.aaai.org/index.php/AAAI/article/view/4657) | OpenAlex 約 852；[紀錄](https://openalex.org/W2964300796) | 為每位參與者保留獨立狀態，而非把頻道視為單一說話者；可轉化為 per-user short-term state 與 thread participant state。 |
| 檢索增強生成 | [Lewis et al., *Retrieval-Augmented Generation…* (NeurIPS 2020)](https://papers.neurips.cc/paper/2020/hash/6b493230205f780e1bc26945df7481e5-Abstract.html) | Semantic Scholar 約 12,163；[紀錄頁](https://www.semanticscholar.org/paper/96ae8c579f4463264dc06a88f014fbf2272e5f46) | 把模型內部知識與外部、可更新記憶分開。對股價、代號、公告等問題，外部來源必須覆蓋模型印象。 |
| Dense retrieval | [Karpukhin et al., *Dense Passage Retrieval* (EMNLP 2020)](https://aclanthology.org/2020.emnlp-main.550/) | Semantic Scholar 約 5,272；[關聯紀錄](https://www.semanticscholar.org/paper/f1595aafa9b5854a5b6aa7c2d4da2b14927f7854) | dual encoder 支撐語意檢索，但本案必須在向量搜尋前後加 `userId/threadId/entity/type/time` filter 與 rerank，不能只用 prompt embedding。 |
| 對話幻覺 | [Shuster et al., *Retrieval Augmentation Reduces Hallucination in Conversation* (Findings EMNLP 2021)](https://aclanthology.org/2021.findings-emnlp.320/) | Semantic Scholar 約 1,003–1,186；[直接紀錄](https://www.semanticscholar.org/paper/Retrieval-Augmentation-Reduces-Hallucination-in-Shuster-Poff/a2a7033a5a859e3a6e6f0a83018326400b4c5faa) | 多輪對話檢索要用完整對話脈絡形成查詢，再由知識證據生成；直接依賴模型參數知識較容易產生不可驗證說法。 |
| 忠實度 | [Maynez et al., *On Faithfulness and Factuality…* (ACL 2020)](https://aclanthology.org/2020.acl-main.173/) | Semantic Scholar 約 1,353；引用證據見上列 Shuster 紀錄的 references | 將「語句流暢」與「受到來源支持」分開。生成後應逐一檢查股票代號、公司名、價格、日期等原子主張。 |
| 長期記憶排序 | [Park et al., *Generative Agents* (UIST 2023)](https://doi.org/10.1145/3586183.3606763) | OpenAlex 系資料約 710；[索引頁](https://www.rankless.org/hit-papers/10.1145/3586183.3606763) | relevance + recency + importance 的三因子檢索及 reflection 很適合長期記憶，但只能在 subject/thread 已確定後使用，不能拿它代替歸屬判斷。 |
| 幻覺偵測資料 | [Niu et al., *RAGTruth* (ACL 2024)](https://aclanthology.org/2024.acl-long.585/) | OpenAlex 約 74；[紀錄](https://openalex.org/W4402671555) | 近 18,000 筆 RAG 回答，含 response 與 word-level 幻覺標註；可借用其「不受來源支持的 span」觀念建立 BoboBot 回覆檢查器。 |

補充：引用多不等於最適合本案。Elsner/Kummerfeld 的引用量不及 RAG，但它們直接定義了多人聊天室拆線問題；MPC-BERT 的引用較少，卻提供最貼近「who says what to whom」的自監督任務。碩論若要有清楚貢獻，可以把這些成熟構件組成一個 **speaker-thread-intent-aware memory retrieval** 系統，並以 Discord 真實資料驗證，而不是再提出一個無法解釋的單一 prompt。

## 對現有程式的診斷與映射

目前程式已具備幾個好基礎：

- `src/utils/gemini/memory.ts` 的 `getHybridContext()` 會合併近期訊息和明確 reply chain。
- `src/commands/bobo.ts` 將 author、時間衰減、reply target 與圖片描述帶入 prompt。
- `src/utils/gemini/chat.ts` 以 `user_id` 篩選 Mem0，降低跨使用者長期記憶串線。
- `updateMemoryInBackground()` 已只把使用者原話送入 Mem0，不再把 AI 回答回灌。這能阻止「一次 hallucination 直接變永久記憶」。

但案例仍會失敗，原因是：

1. `getHybridContext()` 仍把頻道最近最多 50 則訊息整批交給模型；時間衰減不是 topic disentanglement。多個熱門話題同時存在時，「美光」可能比「6515」的正確實體映射更顯眼。
2. 明確 reply chain 只保證被取回，沒有排除其他 thread。
3. Mem0 搜尋只用原始 `prompt` 與 `user_id`；未加入 `thread_id`、entity、memory type、可信度與來源狀態。
4. 「使用者說過」不等於「事實」。即使不再儲存 AI 輸出，人類聊天室中的猜測、反串與謠言仍可能進入記憶。
5. 股票實體解析與自然語言生成界線不夠硬。`6515 → 欣興` 應是 deterministic lookup 的結果，不是 LLM 可自行改寫的內容。

## 建議的分階段架構

### 第 0 層：確定性正規化與實體鎖定

先處理不應交給 LLM 猜測的訊號：Discord message/reply/mention ID、使用者 ID、URL、時間，以及台股四位數代號。對 `6515` 呼叫既有 `lookupStockTicker()` / `getTaiwanStockName()`，產生不可由模型覆蓋的：

```ts
type ResolvedEntity = {
  surface: string       // "6515"
  canonicalId: string   // "TWSE:6515"
  canonicalName: string // "欣興"
  source: 'stock_lookup'
  confidence: 1
}
```

若 lookup 失敗，就明說查不到或要求澄清；不可根據頻道熱詞補成「美光」。

### 第 1 層：reply-to / thread router

每則新訊息先對最近候選訊息算邊分數：

```text
edgeScore =
  4.0 * explicitReply
+ 2.5 * directMention
+ 1.5 * canonicalEntityOverlap
+ 1.2 * semanticSimilarity
+ 0.8 * sameSpeakerContinuation
+ 0.6 * temporalProximity
- 2.0 * conflictingEntity
```

明確 reply 是硬邊；否則選分數最高且高於閾值的 parent。再用 parent 的 connected component / root 得到 `threadId`。低於閾值就開新 thread，不要強迫併線。權重需用標註資料校正，上式只是可立即實作的起點。

### 第 2 層：speaker-aware 意圖與 dialogue act

使用 Gemini structured output（或小型分類器）一次輸出受限 JSON，不直接生成答案：

```ts
type UtteranceAnalysis = {
  addresseeIds: string[]
  dialogueAct:
    | 'question' | 'statement' | 'agreement' | 'disagreement'
    | 'correction' | 'backchannel' | 'request_action'
  intent:
    | 'ask_stock_fact' | 'ask_analysis' | 'ask_memory'
    | 'correct_bot' | 'casual_chat' | 'no_ai_request'
  entities: ResolvedEntity[]
  needsExternalFact: boolean
  confidence: number
}
```

分類器只看「選中的 thread + 明確 reply chain + 呼叫訊息」，而不是整個頻道。若 `confidence` 低，回答時反問一句或只處理明確部分。

### 第 3 層：分庫、帶 provenance 的記憶

至少分開三種資料，避免同一向量庫把不同可信層級混在一起：

- **Episodic chat**：誰在何時、哪個 thread 說了什麼；不是客觀真相。
- **User profile/preference**：穩定偏好、稱呼、長期持倉習慣；必須有 subject user。
- **Verified knowledge**：股票代號表、報價、公告、官方文件；含來源與有效時間。

建議 SQLite metadata schema：

```ts
type MemoryRecord = {
  id: string
  kind: 'episode' | 'profile' | 'claim' | 'verified_fact'
  subjectUserId?: string
  threadId?: string
  canonicalEntityIds: string[]
  value: string
  sourceMessageIds: string[]
  sourceAuthorIds: string[]
  sourceType: 'human_message' | 'official_api' | 'moderator_confirmed'
  epistemicStatus: 'asserted' | 'verified' | 'disputed' | 'retracted'
  confidence: number
  observedAt: number
  validUntil?: number
  extractorVersion: string
}
```

寫入流程應採「候選記憶 → 驗證/合併 → 正式記憶」兩階段。股票傳聞預設 `asserted` 且短 TTL；只有官方 API/公告可升為 `verified`。AI 回答永遠不是 source。對代名詞未解析、subject 不明、反串/引述不明的內容不要寫長期 profile。

### 第 4 層：intent-aware hybrid retrieval

先做 metadata filter，再做 dense + lexical hybrid search，最後 rerank：

```text
retrievalScore =
  0.40 * semanticRelevance
+ 0.20 * entityMatch
+ 0.15 * threadMatch
+ 0.10 * speakerMatch
+ 0.10 * recency
+ 0.05 * importance
+ authorityBonus
- disputedPenalty
```

- `ask_stock_fact`：只取 `verified_fact`，優先即時工具，不取聊天室 claim 當答案。
- `ask_memory`：只取當前 subject user 的 profile/episode；涉及「剛才」時限定當前 thread。
- `ask_analysis`：可同時取 verified facts 與該 thread 的假設，但 prompt 必須標示「已驗證」和「聊天室說法」。
- `correct_bot`：把修正寫為對先前回答的 audit event，不把舊回答當成可檢索記憶。

### 第 5 層：有證據生成與寫入閘門

傳給 Gemini 的 context 應為結構化 evidence blocks，每筆含 `sourceId`、speaker、thread、status、timestamp；要求回答中的公司名、代號、數值、日期只能來自 evidence。生成後再做便宜的 deterministic validator：

- 回答同時出現 `6515` 與非「欣興」公司名：拒絕並重生。
- 報價沒有即時工具結果：不給精確現價。
- 回答中的每個 canonical entity 必須存在於 evidence。
- 沒有足夠證據時輸出「目前無法確認」，不補猜。

## 資料集與評估

### 可用公開資料

- **Ubuntu IRC disentanglement**：Kummerfeld et al. 2019 的 77,563 則 reply graph，先驗證 thread router。
- **MRDA**：多人會議 dialogue acts，適合 speaker-aware act classification。
- **Switchboard / SwDA**：大量 dialogue act 標註；雖多為雙人電話，可預訓練 act taxonomy。
- **MELD / IEMOCAP**：可測 speaker-state 表示，但情緒不是本案核心，不應當主要 KPI。
- **RAGTruth**：測 supported / unsupported span 與回答 grounding。

### 必須自建的 BoboBot golden set

公開資料缺少台灣 Discord 俚語、股票代號、emoji、反串、機器人呼叫方式。建議從已獲同意且去識別化的歷史訊息抽 500–1,000 個 `!bobo` 事件，讓兩位標註者標記：

1. parent message 與 `threadId`；
2. caller、addressee、dialogue act、intent；
3. canonical entities（如 `TWSE:6515`）；
4. 回答需要的 evidence message IDs；
5. 每個回答原子主張是否受 evidence 支持；
6. 是否應寫入記憶、subject 是誰、status/TTL。

切分時以頻道或日期區段分 train/dev/test，避免同一串對話同時出現在訓練與測試。

### 指標

| 層 | 指標 | MVP 合格線建議 |
|---|---|---:|
| reply-to | parent accuracy、link precision/recall/F1 | explicit reply 100%；implicit link F1 ≥ 0.80 |
| thread | Adjusted Rand Index / Variation of Information、thread purity | purity ≥ 0.90 |
| addressee/intent | macro-F1、per-class recall、abstention coverage | 關鍵類別 `ask_stock_fact`、`correct_bot` recall ≥ 0.95 |
| entity | exact match / canonicalization accuracy | 股票代號 ≥ 0.995 |
| retrieval | Recall@k、MRR、nDCG；另測 wrong-user / wrong-thread retrieval rate | evidence Recall@5 ≥ 0.90；跨使用者污染 < 0.5% |
| grounding | atomic claim precision（可參考 [FActScore](https://aclanthology.org/2023.emnlp-main.741/)）、unsupported-claim rate | 代號/公司映射 100%；總 unsupported claims < 2% |
| memory write | precision、contradiction rate、AI-output-ingestion rate | write precision ≥ 0.95；AI 回答寫入率 = 0 |
| 產品 | 更正率、澄清率、p50/p95 latency、token cost | 與目前版本做 A/B baseline |

## 建議 MVP：先做四週，不先訓練新模型

1. **建立事件與 metadata 表**：保存 message/reply/mention/entity/thread/analysis/evidence，不急著替換 Mem0。
2. **做 deterministic entity gate**：所有股票代號先查既有 registry；加入 `6515 → 欣興`、`MU → 美光` 等 regression tests。
3. **做 rule-first thread router**：explicit reply > mention > entity overlap > embedding/time；只傳入選中 thread，保留最多 1–2 則鄰近其他 thread 作背景且明確標為 out-of-thread。
4. **做 structured intent classifier**：Gemini 僅回 JSON；低信心 abstain。
5. **包一層 MemoryRepository**：Mem0 仍負責向量存取，但 SQLite 保存完整 metadata/provenance，搜尋前後強制 subject/thread/kind/status filter。
6. **做 evidence validator**：代號、公司名、數值與日期逐項檢查；失敗就重生一次，仍失敗則安全拒答。
7. **建立 100 個高風險 regression cases**：至少涵蓋多話題交錯、同名使用者、引用別人的話、反串、更正舊回答、股票代號與美股 ticker 衝突。

MVP 的真正成功條件不是「回答更像人」，而是能回答三個可稽核問題：**它認為使用者在回哪一串？它取了哪些記憶？每個事實由哪個來源支持？** 先讓這三項可觀測，再考慮用 MPC-BERT、GNN 或本地小模型取代規則與 Gemini 分類器。

## 可形成碩論的研究問題

一個具體且可驗證的題目可以是：

> 在非同步、多話題、多人 Discord 聊天中，加入 speaker/thread/intent metadata constraints 的混合記憶檢索，是否能相較於純 recency context 與純向量 Mem0 retrieval，降低 wrong-thread retrieval 與 unsupported factual claims？

建議三組消融：

- Baseline A：現行 recent-50 + time decay。
- Baseline B：recent-50 + user-scoped dense retrieval。
- Proposed：reply graph + speaker/addressee + intent-aware metadata filter + evidence gate。

主要因變數用 thread link F1、evidence Recall@5、wrong-user/wrong-thread retrieval rate、atomic factual precision；次要因變數再看回答偏好與延遲。這樣碩論內容會直接轉成可部署元件，也能精確回答「多人、不同話題、呼叫者意圖與正確回憶」四個需求。
