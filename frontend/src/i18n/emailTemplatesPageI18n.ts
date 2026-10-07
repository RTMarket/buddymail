import type { SiteLocale } from "./siteLocaleTypes";

const MAX_TEMPLATE_TAG_LEN = 15;

export type EmailTemplatesPageStrings = {
  pageTitle: string;
  newTemplate: string;
  saveTemplate: string;
  saving: string;
  saveAsNew: string;
  metaSectionTitle: string;
  templateNameLabel: string;
  templateNamePlaceholder: string;
  templateTagLabel: string;
  newTagPlaceholder: string;
  addTag: string;
  selectTagLabel: string;
  tagOptionalPlaceholder: string;
  starterPresetsTitle: string;
  libraryTitle: string;
  libraryCount: (shown: number, total: number) => string;
  librarySearchLabel: string;
  librarySearchPlaceholder: string;
  filterByTag: string;
  allTags: string;
  libraryEmpty: string;
  libraryNoMatch: string;
  folderBadge: string;
  nameLabel: string;
  tagLabel: string;
  preview: string;
  openEdit: string;
  delete: string;
  subjectSectionTitle: string;
  subjectSectionDescription: string;
  subjectFieldLabel: string;
  bodySectionTitle: string;
  bodySectionFeatures: string[];
  bodyBgLabel: string;
  bodyBgLight: string;
  bodyBgDeep: string;
  bodyBgHint: string;
  bodyMediaLabel: string;
  localVideo: string;
  bodyMediaHint: string;
  bodyMediaVideoFormats: string;
  errBodyImageMax: (max: number) => string;
  errBodyVideoMax: (max: number) => string;
  errBodyVideoFormat: string;
  errBodyMediaSize: (maxMb: number) => string;
  canvasHint: string;
  signatureTitle: string;
  signatureDescription: string;
  signatureOptionalNote: string;
  signatureBgSyncNote: string;
  previewTestTitle: string;
  previewTestDescription: string;
  collapsePreview: string;
  openPreview: string;
  previewSubjectPrefix: string;
  previewSubjectEmpty: string;
  previewHint: string;
  previewAttachmentsTitle: string;
  previewNoAttachments: string;
  sendTestTitle: string;
  sendTestDescription: string;
  sendTest: string;
  sending: string;
  attachmentsTitle: string;
  attachmentsIntro: string;
  attachmentsSaveHint: string;
  uploadDocument: string;
  uploadAttachmentImage: string;
  selectedDocuments: (count: number, max: number) => string;
  attachmentImages: (count: number, max: number) => string;
  remove: string;
  previewDialogLabel: string;
  emailPreview: string;
  templateFallbackName: string;
  close: string;
  loading: string;
  previewWidthHint: string;
  previewSubjectLine: string;
  noSubject: string;
  defaultSubject: string;
  defaultBodyHtml: string;
  previewComplianceHtml: string;
  errEnterTagName: string;
  errNameBeforeSave: string;
  errNameBeforeSaveAs: string;
  savedTemplate: string;
  savedAsNew: string;
  newBlankTemplate: string;
  loadedTemplate: (name: string) => string;
  deletedTemplate: (name: string) => string;
  tagAdded: (tag: string) => string;
  deleteConfirm: (name: string) => string;
  errVideoFile: string;
  errValidRecipient: string;
  errBodyRequired: string;
  errSubjectRequired: string;
  errSenderChannel: string;
  errSenderInvalid: string;
  testSent: string;
  errDocsMax: (max: number) => string;
  errImagesMax: (max: number) => string;
  validateTag: (raw: string) => string | null;
  commerceTitle: string;
  commerceHint: string;
  commerceOpen: string;
  commerceCollapse: string;
  commerceHeadlineLabel: string;
  commerceIntroLabel: string;
  commerceDefaultHeadline: string;
  commerceDefaultIntro: string;
  commerceUploadScreenshots: string;
  commerceUploading: string;
  commerceGeneratingLayout: string;
  commerceInsertFailed: string;
  commercePersistingImages: string;
  commerceResetOnePerImage: (n: number) => string;
  commerceOnePerImageReset: (n: number) => string;
  commerceUploadHint: string;
  commerceProductTitle: string;
  commercePrice: string;
  commerceComparePrice: string;
  commerceLink: string;
  commerceCta: string;
  commerceEmpty: string;
  commerceGenerate: string;
  commerceReplaceBody: string;
  commerceErrImageOnly: string;
  commerceErrNeedProduct: string;
  commerceInserted: string;
  commerceColumnsLabel: string;
  commerceLayoutHintLabel: string;
  commerceLayoutHintPlaceholder: string;
  commerceShopScreensLabel: string;
  commerceGridSplit: string;
  commerceGridRowsLabel: string;
  commerceReplaceImage: string;
  commerceProductCount: (n: number) => string;
  commerceParseOk: (n: number) => string;
  commercePreviewLayout: string;
  aiConfigTitle: string;
  aiModeLink: string;
  aiModeImage: string;
  visionTitle: string;
  visionHint: string;
  visionOpen: string;
  visionCollapse: string;
  visionSettingsTitle: string;
  visionSettingsHint: string;
  visionProviderLabel: string;
  visionBaseUrlLabel: string;
  visionModelLabel: string;
  visionApiKeyLabel: string;
  visionApiKeyPlaceholder: string;
  visionApiKeyPlaceholderSaved: string;
  visionApiKeyNote: string;
  visionConfigSave: string;
  visionConfigSaving: string;
  visionConfigSaved: string;
  visionConfigSaveErr: string;
  visionConfigReady: string;
  visionConfigMissing: string;
  visionConfigBrief: (model: string) => string;
  visionColumnsLabel: string;
  visionLayoutHintLabel: string;
  visionUploadImages: string;
  visionImagesLabel: string;
  quillImageEnlarge: string;
  quillImageShrink: string;
  quillImageCrop: string;
  quillImageReplace: string;
  quillImageCropTitle: string;
  quillImageCropCancel: string;
  quillImageCropConfirm: string;
  quillImageCropHint: string;
  visionGenerateButton: string;
  visionGenerating: string;
  visionInsertingImage: string;
  visionRecognizingLayout: string;
  visionGenerateSuccess: () => string;
  visionErrNeedImage: string;
  visionErrNeedConfig: string;
  linkImportTitle: string;
  linkImportHint: string;
  linkImportPlaceholder: string;
  linkImportButton: string;
  linkImportBusy: string;
  linkImportNote: string;
  linkImportReplaceBody: string;
  linkImportFillSubject: string;
  linkImportSuccess: string;
  linkImportErrUrlRequired: string;
  linkImportErrEmpty: string;
  linkImportQuillReject: string;
  visionConfigTest: string;
  visionConfigTesting: string;
  visionConfigTestOk: string;
  visionConfigTestFail: string;
};

export function getEmailTemplatesPageStrings(locale: SiteLocale): EmailTemplatesPageStrings {
  const validateTag = (raw: string): string | null => {
    const t = raw.trim();
    if (!t) return null;
    if ([...t].length > MAX_TEMPLATE_TAG_LEN) {
      return locale === "en"
        ? `Template tag must be at most ${MAX_TEMPLATE_TAG_LEN} characters`
        : `模版标签请控制在 ${MAX_TEMPLATE_TAG_LEN} 个字以内`;
    }
    return null;
  };

  if (locale === "en") {
    return {
      pageTitle: "Email templates",
      newTemplate: "New",
      saveTemplate: "Save template",
      saving: "Saving…",
      saveAsNew: "Save as new template",
      metaSectionTitle: "Template info",
      templateNameLabel: "Template name",
      templateNamePlaceholder: "e.g. Spring promo – auto parts",
      templateTagLabel: "Template tag",
      newTagPlaceholder: "New tag, e.g. auto parts",
      addTag: "Add tag",
      selectTagLabel: "Tag for this template",
      tagOptionalPlaceholder: "Optional",
      starterPresetsTitle: "Campaign starter templates",
      libraryTitle: "Template library",
      libraryCount: (shown, total) => `${shown} / ${total}`,
      librarySearchLabel: "Search (name, tag, or subject)",
      librarySearchPlaceholder: "Filter folders below…",
      filterByTag: "Or filter by tag",
      allTags: "All tags",
      libraryEmpty: "Library is empty. Use New in the top-right, save, and it will appear here.",
      libraryNoMatch: "No templates match your search or tag. Try another keyword or All tags.",
      folderBadge: "Email template",
      nameLabel: "Name",
      tagLabel: "Tag",
      preview: "Preview",
      openEdit: "Open",
      delete: "Delete",
      subjectSectionTitle: "Email subject",
      subjectSectionDescription:
        "Subject line recipients see when sent. Can mirror the template name. Variables supported, e.g. {{name}} {{company}}.",
      subjectFieldLabel: "Email subject",
      bodySectionTitle: "Email template body editor (rich text)",
      bodySectionFeatures: [
        "Article URL → email template (layout, text & images)",
        "Vision → replicate screenshot as template",
        "Commerce products → grid layout editor",
        "Images in editor: crop, resize & replace"
      ],
      bodyBgLabel: "Template background",
      bodyBgLight: "Lighter",
      bodyBgDeep: "Deeper",
      bodyBgHint: "Whole-body background; text colors still use the toolbar above.",
      bodyMediaLabel: "Body media",
      localVideo: "Local video",
      bodyMediaHint:
        "Body: up to 5 images + 3 videos (≤15MB each; total inline media ≤18MB). Images: toolbar or click image to crop/resize/replace. Videos: MP4/WebM/MOV with controls (audio kept if encoded); drag bottom-right to resize. Many clients block autoplay—recipients tap to play.",
      bodyMediaVideoFormats: "Video: MP4 · WebM · MOV · max 15MB each · max 3 in body",
      errBodyImageMax: (max) => `At most ${max} images in the body editor.`,
      errBodyVideoMax: (max) => `At most ${max} videos in the body editor.`,
      errBodyVideoFormat: "Body video must be MP4, WebM, or MOV.",
      errBodyMediaSize: (maxMb) => `Single file must be ≤${maxMb}MB.`,
      canvasHint:
        "Email canvas · ~600px wide (matches thumbnails). Toolbar includes font color (A with underline) and background color.",
      signatureTitle: "Signature (optional)",
      signatureDescription: "Appended below the body when sending. Leave empty to skip.",
      signatureOptionalNote: "Empty signature is not sent — no impact on campaigns.",
      signatureBgSyncNote: "Background matches the body template above.",
      previewTestTitle: "Preview & test",
      previewTestDescription:
        "Write subject, body, and signature first. Preview mail shows the editor; library Preview shows the saved version. Pick a send channel and from-address before test send.",
      collapsePreview: "Hide preview",
      openPreview: "Preview email",
      previewSubjectPrefix: "Subject:",
      previewSubjectEmpty: "(no subject)",
      previewHint:
        "Click Preview email to see subject, body, signature, attachments, and compliance links (same as bulk send).",
      previewAttachmentsTitle: "Attachments",
      previewNoAttachments: "No attachments",
      sendTestTitle: "Send test email",
      sendTestDescription: "",
      sendTest: "Send test email",
      sending: "Sending…",
      attachmentsTitle: "Attachments (included on bulk send)",
      attachmentsIntro:
        "Compressed files can also be uploaded (zip, 7z, rar, tar, tgz, gz, bz2, xz, zst, cab, and similar archives), plus Word, Excel, PDF. Each file ≤5MB, max 3. Original filenames are kept (Chinese names are not garbled). Attachment images: ≤2MB each, max 3 (as attachments, not inline). Toolbar inline images are not limited to 3.",
      attachmentsSaveHint:
        "After uploading, click Save template so bulk send includes these files. Test send uses the current list even before save.",
      uploadDocument: "Upload attachment",
      uploadAttachmentImage: "Upload attachment image",
      selectedDocuments: (count, max) => `Documents (${count}/${max})`,
      attachmentImages: (count, max) => `Attachment images (${count}/${max})`,
      remove: "Remove",
      previewDialogLabel: "Template preview",
      emailPreview: "Email preview",
      templateFallbackName: "Template",
      close: "Close",
      loading: "Loading…",
      previewWidthHint: "~600px wide · typical reading width",
      previewSubjectLine: "Subject",
      noSubject: "(no subject)",
      defaultSubject: "Hello {{name}}, this is a test email",
      defaultBodyHtml: "<p>Hello,</p><p>This is an <strong>editable</strong> email template.</p>",
      previewComplianceHtml:
        '<div style="margin-top:20px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:12px;color:#64748b;">' +
        'System will append: <span style="color:#2563eb;">Subscribe</span> | <span style="color:#2563eb;">Unsubscribe</span> | <span style="color:#2563eb;">Complaint</span>' +
        "</div>",
      errEnterTagName: "Enter a tag name.",
      errNameBeforeSave: "Enter a template name under Template info on the left before saving.",
      errNameBeforeSaveAs: "Enter a template name under Template info on the left before saving as new.",
      savedTemplate: "Template saved",
      savedAsNew: "Saved as a new template; it will appear in the library.",
      newBlankTemplate: "Blank template created",
      loadedTemplate: (name) => `Loaded template “${name}”`,
      deletedTemplate: (name) => `Template “${name}” deleted`,
      tagAdded: (tag) => `Tag “${tag}” added`,
      deleteConfirm: (name) => `Delete template “${name}”? This cannot be undone.`,
      errVideoFile: "Please choose a video file",
      errValidRecipient: "Enter a valid recipient email.",
      errBodyRequired: "Enter body content first.",
      errSubjectRequired: "Enter an email subject first.",
      errSenderChannel: "Select a send channel (light SMTP, medium, or dedicated lane).",
      errSenderInvalid: "Invalid send channel. Please select again.",
      testSent: "Sent",
      errDocsMax: (max) => `At most ${max} documents`,
      errImagesMax: (max) => `At most ${max} attachment images`,
      validateTag,
      commerceTitle: "Commerce email assistant",
      commerceHint:
        "Each uploaded image becomes one product card. Edit fields below, then generate.",
      commerceOpen: "Open assistant",
      commerceCollapse: "Collapse",
      commerceHeadlineLabel: "Headline",
      commerceIntroLabel: "Intro line",
      commerceDefaultHeadline: "Weekly deals · Featured picks",
      commerceDefaultIntro: "Limited-time offers below — shop now.",
      commerceUploadScreenshots: "Upload product images",
      commerceUploading: "Uploading…",
      commerceGeneratingLayout: "Inserting layout…",
      commerceInsertFailed: "Could not write to the body editor — open a template first.",
      commercePersistingImages: "Layout inserted — uploading images in the background…",
      commerceResetOnePerImage: (n) => `Reset to ${n} product(s) — one full image each`,
      commerceOnePerImageReset: (n) => `Reset to ${n} product(s) (one per uploaded image).`,
      commerceUploadHint: "One product per uploaded image — click Generate to insert.",
      commerceProductTitle: "Product title",
      commercePrice: "Sale price",
      commerceComparePrice: "Was price (optional)",
      commerceLink: "Product link",
      commerceCta: "Button text",
      commerceEmpty: "Upload product images first.",
      commerceGenerate: "Generate & insert into body",
      commerceReplaceBody: "Replace entire body (uncheck to append)",
      commerceErrImageOnly: "Please choose image files only.",
      commerceErrNeedProduct: "Upload at least one product image first.",
      commerceInserted: "Layout inserted — edit text and images in the body editor.",
      commerceColumnsLabel: "Products per row",
      commerceLayoutHintLabel: "Layout notes (optional)",
      commerceLayoutHintPlaceholder: "e.g. 3 per row, highlight sale prices, skip header…",
      commerceShopScreensLabel: "Uploaded product images",
      commerceGridSplit: "Grid split",
      commerceGridRowsLabel: "Grid rows (auto if empty)",
      commerceReplaceImage: "Replace image",
      commerceProductCount: (n) => `${n} product(s) ready`,
      commerceParseOk: (n) => `Split into ${n} product(s) — review and edit below`,
      commercePreviewLayout: "Mail layout preview",
      aiConfigTitle: "Vision AI settings (legacy, not on template page)",
      aiModeLink: "Paste article URL · generate template",
      aiModeImage: "Upload image · one-click template",
      visionTitle: "Smart vision · one-click template",
      visionHint:
        "Upload a screenshot — AI replicates layout, text and images into the editor. Requires your vision API key.",
      visionOpen: "Open",
      visionCollapse: "Collapse",
      visionSettingsTitle: "Vision model settings",
      visionSettingsHint:
        "Any OpenAI-compatible API with a vision/multimodal model works (OpenAI, DeepSeek endpoint, Doubao Ark, SiliconFlow, etc.).",
      visionProviderLabel: "Provider preset",
      visionBaseUrlLabel: "API base URL",
      visionModelLabel: "Model name",
      visionApiKeyLabel: "API key",
      visionApiKeyPlaceholder: "Paste your API key",
      visionApiKeyPlaceholderSaved: "Saved — paste a new key to replace",
      visionApiKeyNote: "Key is stored for your tenant only and shown masked after save.",
      visionConfigSave: "Save settings",
      visionConfigSaving: "Saving…",
      visionConfigSaved: "Vision model settings saved.",
      visionConfigSaveErr: "Could not save settings.",
      visionConfigReady: "API key saved (legacy vision API only).",
      visionConfigMissing: "Save a vision API key above before generating.",
      visionConfigBrief: (model) => `Configured model: ${model}`,
      visionColumnsLabel: "Images per row",
      visionLayoutHintLabel: "Recognition notes (optional)",
      visionUploadImages: "Upload images",
      visionImagesLabel: "Uploaded images",
      quillImageEnlarge: "Larger",
      quillImageShrink: "Smaller",
      quillImageCrop: "Crop",
      quillImageReplace: "Replace",
      quillImageCropTitle: "Crop image",
      quillImageCropCancel: "Cancel",
      quillImageCropConfirm: "Apply crop",
      quillImageCropHint: "Drag on the image to select the area to keep.",
      visionGenerateButton: "Generate from screenshot (legacy)",
      visionGenerating: "Generating…",
      visionInsertingImage: "Inserting screenshot…",
      visionRecognizingLayout: "Screenshot inserted — recognizing text & layout…",
      visionGenerateSuccess: () => "Layout replicated into the body editor — edit text, swap or resize images anytime.",
      visionErrNeedImage: "Upload at least one product screenshot first.",
      visionErrNeedConfig: "Open settings and save your vision API key first.",
      linkImportTitle: "Paste article URL · generate template",
      linkImportHint:
        "Paste a WeChat article URL, enter a template name, subject, and tag, then save it directly to the template library.",
      linkImportPlaceholder: "",
      linkImportButton: "Generate template",
      linkImportBusy: "Saving template…",
      linkImportNote: "After saving, click the created template in the library to edit it, or choose it from Email Marketing to send.",
      linkImportReplaceBody: "Replace body in editor",
      linkImportFillSubject: "Use article title as email subject",
      linkImportSuccess: "Saved to the template library. Click the created template to edit it, or choose it from Email Marketing to send.",
      linkImportErrUrlRequired: "Please paste an article URL first.",
      linkImportErrEmpty: "Could not extract enough content from this article URL. Try another public article.",
      linkImportQuillReject:
        "Content was generated but could not be inserted into the editor (layout stripped). Try another link or adjust in the editor.",
      visionConfigTest: "Test vision model",
      visionConfigTesting: "Testing…",
      visionConfigTestOk: "Vision model OK — image input works.",
      visionConfigTestFail: "Vision test failed — check model name supports image_url.",
    };
  }

  return {
    pageTitle: "邮件模板",
    newTemplate: "新建",
    saveTemplate: "保存模板",
    saving: "保存中…",
    saveAsNew: "另存为新模版",
    metaSectionTitle: "模版信息",
    templateNameLabel: "模版名称",
    templateNamePlaceholder: "例如：春季促销-汽车配件",
    templateTagLabel: "模版标签",
    newTagPlaceholder: "输入新标签，如：汽车配件",
    addTag: "新增标签",
    selectTagLabel: "选择当前模版使用的标签",
    tagOptionalPlaceholder: "可不填",
    starterPresetsTitle: "营销活动模版",
    libraryTitle: "模版库",
    libraryCount: (shown, total) => `${shown} / ${total} 个`,
    librarySearchLabel: "搜索（模版名称、标签；也可匹配邮件主题）",
    librarySearchPlaceholder: "输入关键字筛选下方文件夹…",
    filterByTag: "或按标签筛选",
    allTags: "全部标签",
    libraryEmpty: "模版库为空：点右上角「新建」创建并保存后，会出现在这里。",
    libraryNoMatch: "没有符合当前搜索或标签的模版，请换个关键字或选「全部标签」。",
    folderBadge: "邮件模版",
    nameLabel: "名称",
    tagLabel: "标签",
    preview: "预览",
    openEdit: "打开编辑",
    delete: "删除",
    subjectSectionTitle: "邮件主题",
    subjectSectionDescription:
      "实际发信时收件人看到的主题行；可与模版名称写成类似文案。支持变量，如 {{name}} {{company}}。",
    subjectFieldLabel: "邮件主题",
    bodySectionTitle: "邮件模版正文内容编辑（富文本）",
    bodySectionFeatures: [
      "复制文章 URL 生成邮件模版（复刻排版、文字与图片）",
      "识图一键生成邮件模版（复刻截图布局）",
      "电商产品编辑与网格排版",
      "正文内图片可裁剪、缩放、替换"
    ],
    bodyBgLabel: "模版背景色",
    bodyBgLight: "更浅",
    bodyBgDeep: "加深",
    bodyBgHint: "整段正文底色；文字颜色仍用下方工具栏里的色彩按钮。",
    bodyMediaLabel: "正文媒体",
    localVideo: "本地视频",
    bodyMediaHint:
      "正文内联：图片最多 5 张、视频最多 3 个；单文件 ≤15MB，合计建议 ≤18MB。图片可用工具栏或点击图片裁剪/缩放/换图。视频支持 MP4/WebM/MOV，带控件可出声（取决于编码）；插入后拖右下角调宽度。多数客户端不支持自动播放，收件人需点击播放。",
    bodyMediaVideoFormats: "视频格式：MP4 · WebM · MOV · 单个 ≤15MB · 正文最多 3 个",
    errBodyImageMax: (max) => `正文图片最多 ${max} 张。`,
    errBodyVideoMax: (max) => `正文视频最多 ${max} 个。`,
    errBodyVideoFormat: "正文视频仅支持 MP4、WebM、MOV 格式。",
    errBodyMediaSize: (maxMb) => `单个文件不能超过 ${maxMb}MB。`,
    canvasHint:
      "邮件画布 · 宽约 600px（与左侧缩略图比例一致）。工具栏在加粗/斜体右侧有字体颜色（字母 A 下划线）与背景色，点击展开色板。",
    signatureTitle: "签名档（可选）",
    signatureDescription: "发信时追加在正文下方；留空则不发送签名。",
    signatureOptionalNote: "签名留空不影响群发，与正文无关。",
    signatureBgSyncNote: "背景色与上方正文模版同步，无需单独再选。",
    previewTestTitle: "预览与测试",
    previewTestDescription:
      "先写主题、正文与签名；「预览邮件」为当前编辑区内容，模版库「预览」为已保存版本。测试发信前请选择套餐通道与发信邮箱。",
    collapsePreview: "收起预览",
    openPreview: "预览邮件",
    previewSubjectPrefix: "主题：",
    previewSubjectEmpty: "（未填写主题）",
    previewHint:
      "点击「预览邮件」查看主题、正文、签名、附件与合规链接（与真实群发一致）。",
    previewAttachmentsTitle: "附件",
    previewNoAttachments: "无附件",
    sendTestTitle: "发送测试邮件",
    sendTestDescription: "",
    sendTest: "发送测试邮件",
    sending: "发送中…",
    attachmentsTitle: "附件（群发时带在邮件上）",
    attachmentsIntro:
      "压缩文件也可以上传：zip、7z、rar、tar、tgz、gz、bz2、xz、zst、cab 等各种压缩包均可，以及 Word、Excel、PDF。单份 ≤ 5MB，最多 3 份。附件按原文件名保存，中文名不会乱码。附件图片：单张 ≤ 2MB，最多 3 张（作为附件，非正文插图）。正文里用工具栏插图不受 3 张限制。",
    attachmentsSaveHint: "上传后请点「保存模版」，正式群发才会带上附件；测试发信可直接用当前列表（无需先保存）。",
    uploadDocument: "上传附件",
    uploadAttachmentImage: "上传附件图片",
    selectedDocuments: (count, max) => `已选文档（${count}/${max}）`,
    attachmentImages: (count, max) => `附件图片（${count}/${max}）`,
    remove: "移除",
    previewDialogLabel: "模版预览",
    emailPreview: "邮件预览",
    templateFallbackName: "模版",
    close: "关闭",
    loading: "加载中…",
    previewWidthHint: "约 600px 宽 · 接近常见邮件阅读宽度",
    previewSubjectLine: "主题",
    noSubject: "（无主题）",
    defaultSubject: "你好 {{name}}，这是一封测试邮件",
    defaultBodyHtml: "<p>你好，</p><p>这是一封<strong>可编辑</strong>的邮件模板。</p>",
    previewComplianceHtml:
      '<div style="margin-top:20px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:12px;color:#64748b;">' +
      '系统将自动附加：<span style="color:#2563eb;">订阅链接</span> | <span style="color:#2563eb;">退订链接</span> | <span style="color:#2563eb;">投诉链接</span>' +
      "</div>",
    errEnterTagName: "请输入新标签名称。",
    errNameBeforeSave: "请先在左侧「模版信息」填写模版名称后再保存。",
    errNameBeforeSaveAs: "请先在左侧「模版信息」填写模版名称后再另存。",
    savedTemplate: "已保存模板",
    savedAsNew: "已另存为新模版，左侧模版库会多一条。",
    newBlankTemplate: "已新建空白模版",
    loadedTemplate: (name) => `已载入模版「${name}」`,
    deletedTemplate: (name) => `模版「${name}」已删除`,
    tagAdded: (tag) => `已添加标签「${tag}」`,
    deleteConfirm: (name) => `确定删除模版「${name}」吗？删除后不可恢复。`,
    errVideoFile: "请选择视频文件",
    errValidRecipient: "请填写有效的收件邮箱。",
    errBodyRequired: "请先填写正文内容。",
    errSubjectRequired: "请先填写邮件主题。",
    errSenderChannel: "请选择发件通道（轻量 SMTP、中量或巨量专线）。",
    errSenderInvalid: "发件通道选择无效，请重新选择。",
    testSent: "已发送",
    errDocsMax: (max) => `文档最多 ${max} 份`,
    errImagesMax: (max) => `附件图片最多 ${max} 张`,
    validateTag,
    commerceTitle: "电商邮件助手",
    commerceHint: "上传几张产品图就生成几个商品（3 张图 → 3 个商品），可在下方填写名称与价格后插入正文。",
    commerceOpen: "打开助手",
    commerceCollapse: "收起",
    commerceHeadlineLabel: "邮件标题行",
    commerceIntroLabel: "导语",
    commerceDefaultHeadline: "本周特价 · 精选好物",
    commerceDefaultIntro: "以下商品限时优惠，欢迎选购。",
    commerceUploadScreenshots: "上传电商产品",
    commerceUploading: "上传中…",
    commerceGeneratingLayout: "正在插入排版…",
    commerceInsertFailed: "无法写入正文编辑器，请先打开或新建一个模版。",
    commercePersistingImages: "排版已插入，正在后台上传图片…",
    commerceResetOnePerImage: (n) => `改回 ${n} 个商品（每张原图一个）`,
    commerceOnePerImageReset: (n) => `已改回 ${n} 个商品（每张上传图对应一个，不再用网格碎片）。`,
    commerceUploadHint: "每张上传图对应一个商品位，点「生成并插入正文」即可。",
    commerceProductTitle: "商品名称",
    commercePrice: "售价",
    commerceComparePrice: "原价（可选）",
    commerceLink: "商品链接",
    commerceCta: "按钮文案",
    commerceEmpty: "请先上传电商产品图。",
    commerceGenerate: "生成并插入正文",
    commerceReplaceBody: "替换整段正文（不勾选则追加到文末）",
    commerceErrImageOnly: "请选择图片文件。",
    commerceErrNeedProduct: "请先上传至少一张电商产品图。",
    commerceInserted: "已插入排版，可在正文编辑器继续修改。",
    commerceColumnsLabel: "每行商品数",
    commerceLayoutHintLabel: "排版说明（可选）",
    commerceLayoutHintPlaceholder: "例如：每行 3 个、突出特价…",
    commerceShopScreensLabel: "已上传电商产品图",
    commerceGridSplit: "按列网格拆分",
    commerceGridRowsLabel: "网格行数（留空自动估算）",
    commerceReplaceImage: "换图",
    commerceProductCount: (n) => `已准备 ${n} 个商品`,
    commerceParseOk: (n) => `已拆分为 ${n} 个商品，请核对并编辑下方字段`,
    commercePreviewLayout: "邮件排版预览",
    aiConfigTitle: "大模型设置（链接与识图共用）",
      aiModeLink: "复制文章 URL 生成邮件模版",
    aiModeImage: "上传图片 一键生成邮件模版",
    visionTitle: "智能识图一键生成邮件模版",
    visionHint: "上传截图，AI 复刻排版、文字与图片到正文编辑器。需绑定识图大模型 API Key。",
    visionOpen: "打开",
    visionCollapse: "收起",
    visionSettingsTitle: "大模型设置",
    visionSettingsHint:
      "支持 OpenAI 兼容接口：OpenAI、DeepSeek、豆包（火山方舟）、硅基流动等；须选用支持图片输入的视觉/多模态模型。",
    visionProviderLabel: "大模型预设",
    visionBaseUrlLabel: "API 地址（Base URL）",
    visionModelLabel: "模型名称",
    visionApiKeyLabel: "API Key",
    visionApiKeyPlaceholder: "粘贴您的 API Key",
    visionApiKeyPlaceholderSaved: "已保存 — 粘贴新 Key 可替换",
    visionApiKeyNote: "Key 仅保存在本租户，保存后以掩码显示，不会明文回显。",
    visionConfigSave: "保存设置",
    visionConfigSaving: "保存中…",
    visionConfigSaved: "大模型设置已保存。",
    visionConfigSaveErr: "保存失败。",
    visionConfigReady: "API Key 已保存（仅遗留识图接口，模版页已下线）。",
    visionConfigMissing: "请先在上方保存大模型 API Key。",
    visionConfigBrief: (model) => `已配置模型：${model}`,
    visionColumnsLabel: "每行图片数",
    visionLayoutHintLabel: "识图说明（可选）",
    visionUploadImages: "上传图片",
    visionImagesLabel: "已上传图片",
    quillImageEnlarge: "放大",
    quillImageShrink: "缩小",
    quillImageCrop: "裁剪",
    quillImageReplace: "替换",
    quillImageCropTitle: "裁剪图片",
    quillImageCropCancel: "取消",
    quillImageCropConfirm: "确定裁剪",
    quillImageCropHint: "在图片上拖拽框选要保留的区域。",
    visionGenerateButton: "智能识图一键生成邮件模版",
    visionGenerating: "生成中…",
    visionInsertingImage: "正在插入截图…",
    visionRecognizingLayout: "截图已插入，正在识别文字与排版…",
    visionGenerateSuccess: () => "已写入正文，可继续改字、换图、缩放。",
    visionErrNeedImage: "请先上传至少一张商品截图。",
    visionErrNeedConfig: "请先打开设置并保存识图大模型 API Key。",
    linkImportTitle: "复制文章 URL 生成邮件模版",
    linkImportHint: "粘贴公众号文章 URL，填写模版名称、邮件主题、模版标签后，直接保存到邮件模版库。",
    linkImportPlaceholder: "",
    linkImportButton: "生成邮件模版",
    linkImportBusy: "正在保存模版…",
    linkImportNote: "保存后会进入邮件模版库；点击左侧已创建的模版可打开编辑，或进入邮件营销选择该模版发送。",
    linkImportReplaceBody: "替换正文编辑器现有内容",
    linkImportFillSubject: "用文章标题填充邮件主题",
    linkImportSuccess: "已保存到邮件模版库。点击已创建的模版可打开编辑，或进入邮件营销选择该模版发送。",
    linkImportErrUrlRequired: "请先粘贴文章 URL。",
    linkImportErrEmpty: "未能从该文章 URL 提取足够正文，请换一条链接或确认文章可公开访问。",
    linkImportQuillReject:
      "已生成内容但未能写入正文编辑器（可能被编辑器过滤）。请换链接或在编辑器中手动调整。",
    visionConfigTest: "测试识图能力",
    visionConfigTesting: "测试中…",
    visionConfigTestOk: "识图正常 — 当前模型支持图片输入。",
    visionConfigTestFail: "识图测试失败 — 请检查模型名是否带视觉/多模态能力。",
  };
}
