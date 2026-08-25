import {
  CheckCircle,
  DownloadSimple,
  FolderOpen,
  Key,
  UploadSimple,
  UserCircle,
} from "@phosphor-icons/react";
import {
  ApiKeyRow,
  PendingLabel,
  PendingToggleRow,
  SettingsGroup,
  SettingsRow,
  SettingsSelect,
  SettingsToggle,
} from "./SettingsPrimitives.jsx";

const ZOOM_OPTIONS = Array.from({ length: 16 }, (_, index) => {
  const percent = 50 + index * 10;
  return { value: String(percent / 100), label: `${percent}%` };
});

const COOKIE_OPTIONS = [
  { value: "essential", label: "仅必要（推荐）" },
  { value: "ask", label: "每次询问" },
  { value: "allow-all", label: "全部允许" },
];

const CLEANUP_OPTIONS = [
  { value: "balanced", label: "标准" },
  { value: "strict", label: "严格" },
  { value: "off", label: "关闭" },
];

function SettingsSection({ children, title }) {
  const headingId = `brizo-settings-${String(title).replace(/\s+/g, "-")}`;
  return (
    <section className="brizo-settings-section" aria-labelledby={headingId}>
      <h2 id={headingId}>{title}</h2>
      {children}
    </section>
  );
}

function PendingPage({ children, title }) {
  return (
    <SettingsSection title={title}>
      <SettingsGroup>
        {children}
      </SettingsGroup>
    </SettingsSection>
  );
}

function PeopleSection({ actions, state }) {
  const profile = state.accountProfile || { name: "本地用户", email: "" };
  return (
    <SettingsSection title="您与 Brizo">
      <div className="brizo-settings-profile-card">
        <span className="brizo-settings-profile-avatar" aria-hidden="true">
          <UserCircle size={30} weight="fill" />
        </span>
        <span className="brizo-settings-profile-copy">
          <strong>{profile.name || "本地用户"}</strong>
          <small>{profile.email || "本地配置"}</small>
        </span>
        <button type="button" onClick={actions.openAccount}>编辑</button>
      </div>
      <SettingsGroup>
        <SettingsRow label="同步功能和 Brizo 服务" description="跨设备同步设置、标签页和历史记录" pending />
        <SettingsRow label="管理 Brizo 账号" pending external />
        <SettingsRow label="自定义个人资料" onClick={actions.openAccount} />
        <SettingsRow
          label="导入书签和设置"
          description="当前支持导入书签"
          onClick={actions.openBookmarkImport}
          pending
        >
          <UploadSimple size={17} aria-hidden="true" />
        </SettingsRow>
        <SettingsRow label="整理收藏夹" onClick={actions.openBookmarkOrganizer}>
          <FolderOpen size={17} aria-hidden="true" />
        </SettingsRow>
      </SettingsGroup>
    </SettingsSection>
  );
}

function AutofillSection({ actions, state }) {
  return (
    <SettingsSection title="自动填充和密码">
      <SettingsGroup title="密码与密钥">
        <SettingsRow
          label="Brizo 密码箱"
          description={`${state.passwordCount || 0} 个本地加密条目`}
          onClick={actions.openPasswordVault}
        >
          <Key size={17} aria-hidden="true" />
        </SettingsRow>
        <SettingsRow label="通行密钥" pending />
      </SettingsGroup>
      <SettingsGroup title="付款方式">
        <SettingsRow label="信用卡和借记卡" pending />
        <SettingsRow label="会员卡" pending />
      </SettingsGroup>
      <SettingsGroup title="联系信息">
        <SettingsRow label="地址" pending />
      </SettingsGroup>
      <SettingsGroup title="身份文件">
        <SettingsRow label="驾照" pending />
        <SettingsRow label="身份证件" pending />
        <SettingsRow label="护照" pending />
      </SettingsGroup>
      <SettingsGroup title="旅行">
        <SettingsRow label="旅行信息" pending />
        <SettingsRow label="交通工具" pending />
      </SettingsGroup>
      <SettingsGroup title="购物">
        <SettingsRow label="购物" pending />
        <SettingsRow label="Google 钱包及相关服务" pending external />
      </SettingsGroup>
      <SettingsGroup title="自动填充设置">
        <PendingToggleRow label="Gemini 增强型自动填充" />
        <SettingsRow label="登录信息智能填充" description="使用 Brizo 本地密码箱匹配登录字段">
          <SettingsToggle
            ariaLabel="登录信息智能填充"
            checked={state.siteHygienePreferences.credentialAutofill !== false}
            onChange={(credentialAutofill) => actions.updateSiteHygiene({ credentialAutofill })}
          />
        </SettingsRow>
      </SettingsGroup>
    </SettingsSection>
  );
}

function PrivacySection({ actions, state }) {
  return (
    <SettingsSection title="隐私与安全">
      <SettingsGroup>
        <SettingsRow
          label="删除浏览数据"
          description="当前可管理网页历史与 Brizo 搜索记录"
          onClick={actions.openHistory}
          pending
        />
        <SettingsRow label="隐私保护指南" description="检查重要的隐私控制设置和安全控件" pending />
        <SettingsRow label="第三方 Cookie" pending />
        <SettingsRow label="安全" description="安全浏览、HTTPS、DNS 和证书设置" pending />
        <SettingsRow label="网站设置" description="外部网页的远程权限请求默认拒绝" pending />
      </SettingsGroup>
      <SettingsGroup title="Brizo 页面处理">
        <SettingsRow label="自动选择 Cookie" description="按你的偏好处理网页 Cookie 弹窗">
          <SettingsSelect
            ariaLabel="自动选择 Cookie"
            options={COOKIE_OPTIONS}
            value={state.siteHygienePreferences.cookieConsent}
            onChange={(cookieConsent) => actions.updateSiteHygiene({ cookieConsent })}
          />
        </SettingsRow>
        <SettingsRow label="页面智能清理" description="清理遮挡阅读的页面元素">
          <SettingsSelect
            ariaLabel="页面智能清理"
            options={CLEANUP_OPTIONS}
            value={state.siteHygienePreferences.cleanupLevel}
            onChange={(cleanupLevel) => actions.updateSiteHygiene({ cleanupLevel })}
          />
        </SettingsRow>
        <SettingsRow label="打开无痕窗口" onClick={actions.openIncognito} />
      </SettingsGroup>
    </SettingsSection>
  );
}

function PerformanceSection() {
  return (
    <SettingsSection title="性能">
      <SettingsGroup title="常规">
        <PendingToggleRow label="性能问题提醒" description="系统检测到性能问题时显示改进建议" />
        <PendingToggleRow label="闲置标签页外观" />
        <SettingsRow label="标签页悬停预览卡片" pending />
        <SettingsRow label="始终让以下网站保持活跃状态" pending />
      </SettingsGroup>
      <SettingsGroup title="内存">
        <PendingToggleRow checked label="省内存模式" description="后台标签页闲置 10 分钟后自动释放；开关待定" />
        <SettingsRow label="省内存模式级别" action="均衡" pending />
      </SettingsGroup>
      <SettingsGroup title="电源">
        <PendingToggleRow label="节能模式" description="限制后台活动与视觉效果" />
        <SettingsRow label="节能模式触发条件" action="电量低于 20%" pending />
      </SettingsGroup>
      <SettingsGroup title="速度">
        <PendingToggleRow label="预加载网页" description="更快速地浏览和搜索内容" />
        <SettingsRow label="预加载级别" action="标准预加载" pending />
      </SettingsGroup>
    </SettingsSection>
  );
}

function AiSection({ actions, state }) {
  return (
    <SettingsSection title="AI 创新功能">
      <SettingsGroup>
        <PendingToggleRow label="更改密码时使用 AI 保护" />
        <SettingsRow label="历史记录搜索" pending />
        <SettingsRow label="帮我写" pending />
        <SettingsRow label="AI 建议" pending />
        <SettingsRow label="内联提示菜单" pending />
        <SettingsRow label="Brizo 中的技能" description="复用提示完成重复性任务" pending />
        <SettingsRow label="听写" pending />
        <SettingsRow label="Gemini" pending />
        <SettingsRow label="Google 搜索 AI 模式和关联的应用" pending external />
      </SettingsGroup>
      <SettingsGroup title="设备端 AI">
        <PendingToggleRow label="设备端 AI" />
      </SettingsGroup>
      <SettingsGroup title="Brizo">
        <SettingsRow label="Pilot 阅读入口" description="只在你主动点击后读取当前网页">
          <SettingsToggle
            ariaLabel="Pilot 阅读入口"
            checked={state.appPreferences.pilotAssist !== false}
            onChange={(pilotAssist) => actions.updateAppPreferences({ pilotAssist })}
          />
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup title="API 与服务">
        <ApiKeyRow
          configured={Boolean(state.analysisProvider)}
          keyMask={state.analysisProvider?.keyMask}
          label="分析 API Key"
          onSave={actions.saveAnalysisKey}
          provider="DeepSeek"
        />
        <ApiKeyRow
          configured={Boolean(state.searchService?.configured)}
          keyMask={state.searchService?.keyMask}
          label="搜索 API Key"
          onSave={actions.saveSearchKey}
          provider="博查"
        />
      </SettingsGroup>
      <p className="brizo-settings-local-note">API Key 仅保存在本机加密存储。</p>
    </SettingsSection>
  );
}

function AppearanceSection({ actions, state }) {
  return (
    <SettingsSection title="外观">
      <SettingsGroup>
        <SettingsRow label="主题" description="Brizo 默认主题" action="重置为默认设置" pending />
        <SettingsRow label="自定义工具栏" action="重置为默认设置" pending />
        <SettingsRow label="模式" action="设备" pending />
        <PendingToggleRow label="显示“主页”按钮" description="已停用；新标签页或自定义网址待定" />
        <SettingsRow label="显示书签栏">
          <SettingsToggle
            ariaLabel="显示书签栏"
            checked={state.appPreferences.showBookmarksBar !== false}
            onChange={(showBookmarksBar) => actions.updateAppPreferences({ showBookmarksBar })}
          />
        </SettingsRow>
        <SettingsRow
          label="智能排序收藏夹"
          description="从收藏夹打开满 5 次后，同层网页按次数置顶；文件夹按其内网页总次数排序"
        >
          <SettingsToggle
            ariaLabel="智能排序收藏夹"
            checked={state.appPreferences.smartBookmarkSorting !== false}
            onChange={(smartBookmarkSorting) => actions.updateAppPreferences({ smartBookmarkSorting })}
          />
        </SettingsRow>
        <SettingsRow label="标签页位置" action="纵向" pending />
        <PendingToggleRow label="显示“已保存的标签页分组”按钮" />
        <PendingToggleRow label="显示“标签页搜索”按钮" />
        <PendingToggleRow label="在书签栏中显示标签页分组" />
        <PendingToggleRow label="自动固定新建的标签页分组" />
        <SettingsRow label="侧边栏位置" pending />
        <SettingsRow label="Brizo 面板" action="向左" pending />
        <PendingToggleRow label="在标签页悬停卡片上显示内存用量" />
        <PendingToggleRow label="在标签页悬停卡片上显示预览图片" />
        <PendingToggleRow label="悬停时展开垂直标签页" />
        <PendingToggleRow label="按最近使用顺序切换标签页（Ctrl+Tab）" />
        <PendingToggleRow label="标签页溢出时显示滚动控件" />
        <PendingToggleRow label="显示 Everything 按钮" />
        <PendingToggleRow label="显示整理面板按钮" />
        <SettingsRow label="字号" action="中（推荐）" pending />
        <SettingsRow label="自定义字体" pending />
        <SettingsRow label="网页缩放">
          <SettingsSelect
            ariaLabel="网页缩放"
            options={ZOOM_OPTIONS}
            value={String(state.pageZoom)}
            onChange={(value) => actions.updatePageZoom(Number(value))}
          />
        </SettingsRow>
        <SettingsRow label="网页横向满铺" description="让外部网页自动适配可用宽度">
          <SettingsToggle
            ariaLabel="网页横向满铺"
            checked={Boolean(state.appPreferences.autoFitZoom)}
            onChange={(autoFitZoom) => actions.updateAppPreferences({ autoFitZoom })}
          />
        </SettingsRow>
        <PendingToggleRow label="按 Tab 突出显示链接和表单字段" />
        <PendingToggleRow label="使用 ⌘Q 退出前显示警告" />
        <PendingToggleRow label="支持窗口边缘拆分视图拖放" />
      </SettingsGroup>
    </SettingsSection>
  );
}

function SearchSection({ onNavigate, state }) {
  const configured = Boolean(state.searchService?.configured);
  return (
    <SettingsSection title="搜索引擎">
      <SettingsGroup>
        <SettingsRow
          label="地址栏中使用的搜索引擎"
          action="DuckDuckGo（固定）"
          pending
        />
        <SettingsRow
          label="Brizo 搜索服务"
          description="用于 Brizo 搜索与网页检索"
          action={configured ? "博查 · 已连接" : "博查 · 未配置"}
          onClick={() => onNavigate("ai")}
        />
        <SettingsRow label="管理搜索引擎和网站搜索" pending />
      </SettingsGroup>
    </SettingsSection>
  );
}

function DefaultBrowserSection() {
  return (
    <PendingPage title="默认浏览器">
      <SettingsRow
        label="将 Brizo 设为默认浏览器"
        description="使用 Brizo 打开其他应用中的网页链接"
        pending
      />
    </PendingPage>
  );
}

function StartupSection() {
  const options = [
    { label: "打开新标签页", pending: true },
    { label: "继续浏览上次打开的网页", pending: true },
    { label: "打开特定网页或一组网页", pending: true },
  ];
  return (
    <SettingsSection title="起始页面">
      <SettingsGroup>
        <div className="brizo-settings-radio-list" role="radiogroup" aria-label="起始页面（待定）">
          {options.map((option) => (
            <label key={option.label}>
              <input checked={option.label === "继续浏览上次打开的网页"} disabled readOnly type="radio" />
              <PendingLabel>{option.label}</PendingLabel>
            </label>
          ))}
        </div>
        <PendingToggleRow label="登录计算机时启动 Brizo" />
      </SettingsGroup>
    </SettingsSection>
  );
}

function LanguagesSection({ state }) {
  const currentLanguage = String(state.appPreferences.language || "").startsWith("en") ? "English" : "简体中文";
  return (
    <SettingsSection title="语言">
      <SettingsGroup title="首选语言">
        <SettingsRow label="网站使用的语言" action={currentLanguage} pending />
        <SettingsRow label="添加语言" pending />
        <SettingsRow label="语言排序、显示与移除" pending />
        <SettingsRow label="以此语言显示 Brizo" action={currentLanguage} pending />
      </SettingsGroup>
      <SettingsGroup title="拼写检查">
        <PendingToggleRow label="在网页上输入文字时检查拼写错误" />
        <SettingsRow label="基本拼写检查" action="已选择" pending />
        <SettingsRow label="增强型拼写检查" pending />
        <SettingsRow label="拼写检查语言" pending />
        <SettingsRow label="自定义拼写检查" pending />
      </SettingsGroup>
      <SettingsGroup title="翻译">
        <PendingToggleRow label="使用翻译" />
        <SettingsRow label="翻译成所选语言" action={currentLanguage} pending />
        <SettingsRow label="自动翻译以下语言" pending />
        <SettingsRow label="一律不询问是否翻译以下语言" pending />
      </SettingsGroup>
    </SettingsSection>
  );
}

function DownloadsSection({ actions, state }) {
  return (
    <SettingsSection title="下载内容">
      <SettingsGroup>
        <SettingsRow
          label="查看下载记录"
          description={`${state.downloadCount || 0} 个项目`}
          onClick={actions.openDownloads}
        >
          <DownloadSimple size={17} aria-hidden="true" />
        </SettingsRow>
        <SettingsRow
          label="位置"
          description={state.appPreferences.downloadLocation || "系统默认下载文件夹"}
          action="更改"
          onClick={actions.chooseDownloadLocation}
        />
        <PendingToggleRow label="下载前询问每个文件的保存位置" />
        <SettingsRow label="下载完成后显示下载内容">
          <SettingsToggle
            ariaLabel="下载完成后显示下载内容"
            checked={state.appPreferences.showDownloadsWhenComplete !== false}
            onChange={(showDownloadsWhenComplete) => actions.updateAppPreferences({ showDownloadsWhenComplete })}
          />
        </SettingsRow>
        <SettingsRow label="清除自动打开文件类型设置" pending />
      </SettingsGroup>
    </SettingsSection>
  );
}

function AccessibilitySection() {
  return (
    <SettingsSection title="无障碍">
      <SettingsGroup>
        <PendingToggleRow label="实时字幕" />
        <PendingToggleRow label="实时翻译" />
        <SettingsRow label="字幕偏好设置" pending external />
        <PendingToggleRow label="短暂地突出显示焦点对象" />
        <PendingToggleRow label="使用文本光标浏览网页" />
        <PendingToggleRow label="获取图片说明" />
        <PendingToggleRow label="帮助屏幕阅读器了解网页结构" />
        <PendingToggleRow label="滑动浏览各个页面" />
        <SettingsRow label="已复制到剪贴板的确认消息" pending>
          <SettingsSelect
            ariaLabel="已复制到剪贴板的确认消息（待定）"
            disabled
            options={[{ value: "default", label: "默认" }]}
            value="default"
          />
        </SettingsRow>
        <SettingsRow label="添加无障碍功能" pending external />
      </SettingsGroup>
    </SettingsSection>
  );
}

function SystemSection() {
  return (
    <SettingsSection title="系统">
      <SettingsGroup>
        <PendingToggleRow label="关闭 Brizo 后继续运行后台应用" />
        <PendingToggleRow label="使用图形加速功能（如果可用）" checked />
        <SettingsRow label="网站隔离状态" pending />
        <PendingToggleRow label="功能通知" />
        <SettingsRow label="打开计算机的代理设置" pending external />
      </SettingsGroup>
      <SettingsGroup title="设备端 AI">
        <PendingToggleRow label="设备端 AI" description="允许本机模型提供诈骗检测等功能" />
      </SettingsGroup>
    </SettingsSection>
  );
}

function ResetSection({ actions }) {
  return (
    <SettingsSection title="重置设置">
      <SettingsGroup>
        <SettingsRow
          label="将设置还原为原始默认设置"
          description="保留 API Key、密码、收藏夹和历史记录"
          action="重置"
          onClick={actions.resetSettings}
        />
      </SettingsGroup>
    </SettingsSection>
  );
}

function ExtensionsSection() {
  return (
    <PendingPage title="扩展程序">
      <SettingsRow
        label="管理扩展程序"
        description="Brizo 尚未开放扩展安装与权限管理"
        pending
        external
      />
    </PendingPage>
  );
}

function HelpSection({ state }) {
  return (
    <SettingsSection title="关于 Brizo">
      <div className="brizo-settings-about-hero">
        <CheckCircle size={26} weight="fill" aria-hidden="true" />
        <span>
          <strong>Brizo {state.appInfo?.version || "0.0.0"}</strong>
          <small>手动签名发布</small>
        </span>
      </div>
      <SettingsGroup>
        <SettingsRow label="Chromium" action={state.appInfo?.chrome || "—"} />
        <SettingsRow label="Electron" action={state.appInfo?.electron || "—"} />
        <SettingsRow label="检查更新" pending />
        <SettingsRow label="报告问题" pending external />
        <SettingsRow label="帮助中心" pending external />
        <SettingsRow label="隐私权政策" pending external />
        <SettingsRow label="服务条款" pending external />
        <SettingsRow label="由组织管理" pending />
      </SettingsGroup>
    </SettingsSection>
  );
}

export function SettingsSectionContent({ actions, onNavigate, section, state }) {
  switch (section) {
    case "people": return <PeopleSection actions={actions} state={state} />;
    case "autofill": return <AutofillSection actions={actions} state={state} />;
    case "privacy": return <PrivacySection actions={actions} state={state} />;
    case "performance": return <PerformanceSection />;
    case "ai": return <AiSection actions={actions} state={state} />;
    case "appearance": return <AppearanceSection actions={actions} state={state} />;
    case "search": return <SearchSection onNavigate={onNavigate} state={state} />;
    case "defaultBrowser": return <DefaultBrowserSection />;
    case "onStartup": return <StartupSection />;
    case "languages": return <LanguagesSection state={state} />;
    case "downloads": return <DownloadsSection actions={actions} state={state} />;
    case "accessibility": return <AccessibilitySection />;
    case "system": return <SystemSection />;
    case "reset": return <ResetSection actions={actions} />;
    case "extensions": return <ExtensionsSection />;
    case "help": return <HelpSection state={state} />;
    default: return <PeopleSection actions={actions} state={state} />;
  }
}
