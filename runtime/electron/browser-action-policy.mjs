const NEGATIVE_SUBMISSION_PATTERNS = [
  /(?:不要|请勿|禁止|严禁|别|勿)(?:再|去|进行|点击|按下|执行|确认|完成)?(?:提交|发送|发布|保存|确认|下单|购买|付款|支付|转账|授权|同意)/i,
  /(?:只|仅)(?:需|要)?(?:填写|填入|填|查看|检查|预览)[\s\S]{0,24}(?:不|不要|无需|不用)(?:再|去|进行|点击|按下)?(?:提交|发送|发布|保存|确认|下单|购买|付款|支付|转账)/i,
  /(?:不|无需|不用)(?:再|去|进行|点击|按下|执行)?(?:提交|发送|发布|保存|确认|下单|购买|付款|支付|转账)/i,
  /\b(?:do\s+not|don't|never)\s+(?:click\s+|press\s+|attempt\s+to\s+)?(?:submit|send|publish|post|save|confirm|order|purchase|buy|pay|transfer|authorize|accept)\b/i,
  /\b(?:do\s+not|don't|never)\s+press\s+(?:the\s+)?enter\b/i,
  /\bwithout\s+(?:submitting|sending|publishing|posting|saving|confirming|ordering|purchasing|paying|transferring)\b/i,
  /\b(?:fill|preview|review)\s+only\b/i,
  /(?:不要|请勿|禁止|别|勿)按(?:下)?(?:回车|enter)/i,
];

const TARGET_PATTERNS = {
  destructive: /删除|移除|清空|注销|销毁|delete|remove|clear|erase|destroy/i,
  commerce: /购买|付款|支付|下单|结账|转账|汇款|buy|purchase|pay|checkout|place\s+order|transfer/i,
  communication: /发送|发布|上传|send|publish|post|upload/i,
  submission: /提交|确认|保存|授权|同意|注册|报名|订阅|submit|confirm|save|authorize|accept|register|sign\s*up|subscribe/i,
};

const COMMAND_AUTHORIZATION_PATTERNS = {
  destructive: /删除|移除|清空|注销|销毁|delete|remove|clear|erase|destroy/i,
  commerce: /购买|付款|支付|下单|结账|转账|汇款|buy|purchase|pay|checkout|place\s+order|transfer/i,
  communication: /发送|发布|上传|send|publish|post|upload/i,
  submission: /提交|确认|保存|授权|同意|注册|报名|订阅|submit|confirm|save|authorize|accept|register|sign\s*up|subscribe/i,
};

const SUBMIT_TARGET_PATTERN = /提交|发送|发布|保存|确认|下单|购买|付款|支付|转账|授权|同意|注册|报名|订阅|搜索|检索|submit|send|publish|post|save|confirm|order|purchase|buy|pay|transfer|authorize|accept|register|sign\s*up|subscribe|search/i;
const EXPLICIT_ENTER_PATTERN = /按(?:下)?(?:回车|enter)|press\s+enter/i;
const SEARCH_INTENT_PATTERN = /搜索|检索|查找|search|find/i;
// “搜” also covers colloquial requests such as “去淘宝搜 10 个产品” and “搜一下”.
const QUERY_INTENT_PATTERN = /搜|查询|检索|查找|查.{0,80}(?:航班|机票|车票|酒店|商品|价格|时间|资料|信息|差评|好评|评论|影评|评价|评分)|\b(?:search|find|look\s+up)\b/i;
const INFORMATION_LOOKUP_INTENT_PATTERN = /(?:多少分|评分|分数|评价|影评|短评|书评|简介|资料|信息|播放量|观看数|点赞数|收藏数|热度|作者|导演|演员|score|rating|reviews?|details?|information|views?)/i;
const SEARCH_FIELD_NAME_PATTERN = /^(?:q|query|keyword|keywords|search|searchquery|searchterm|wd|word)$/i;
const READ_ONLY_QUERY_TARGET_PATTERN = /^(?:(?:开始|立即|重新|执行)?(?:搜索|搜寻|搜一搜|搜一下|查询|检索|查找|查)[\p{L}\d]{0,16}|(?:应用|确认|执行|开始|重新)?(?:筛选|过滤|排序)(?:结果|条件)?|(?:查看|显示|刷新|加载)(?:搜索|查询|筛选|过滤)?结果|(?:search|find|lookup)(?:products?|movies?|books?|videos?|posts?|users?|members?|flights?|hotels?|orders?|records?|prices?|routes?|weather)?|filter|sort|applyfilters?|showresults?|viewresults?|refreshresults?|checkavailability)$/iu;
const CONFIRM_READ_ONLY_FILTER_PATTERN = /^(?:确认筛选|确认过滤|确认排序)$/u;
const EXTERNAL_EFFECT_LABEL_PATTERN = /(?:删除|移除|清空|注销|销毁|购买|付款|支付|下单|结账|转账|汇款|加入购物车|预订|预约|提交|确认|登录|登陆|发送|发布|发表|上传|保存|授权|同意|注册|报名|订阅|点赞|收藏|关注|投票|评论|回复|转发|私信|领取|兑换|安装|delete|remove|clear|destroy|buy|purchase|pay|checkout|transfer|submit|confirm|login|sign\s*in|send|publish|upload|save|authorize|accept|register|signup|subscribe|like|favorite|favourite|bookmark|follow|vote|comment|reply|repost|share|message|install)/iu;
const COMBINED_EXTERNAL_EFFECT_PATTERN = /(?:(?:并|并且|且|然后|之后|后|同时)(?:删除|移除|清空|注销|购买|付款|支付|下单|转账|提交|确认|登录|发送|发布|发表|上传|保存|授权|同意|注册|报名|订阅|点赞|收藏|关注|投票|评论|回复|转发|私信|领取|兑换|安装)|(?:and|then)(?:delete|remove|buy|purchase|pay|submit|confirm|login|send|publish|upload|save|authorize|register|subscribe|like|favorite|follow|vote|comment|reply|share|install))|(?:(?:搜索|搜寻|查询|检索|查找|search|find|lookup)(?:提交|确认|登录|发送|发布|保存|授权|同意|注册|订阅|submit|confirm|login|send|publish|save|authorize|register|subscribe))$/iu;

function compactTargetLabel(value) {
  return String(value || "")
    .replace(/[\uE000-\uF8FF\s:：·.…]/gu, "")
    .trim();
}

function isReadOnlyQueryControl(target) {
  // Exact search/filter controls only retrieve or reorder information. Anchored
  // labels keep combined write actions restricted. The explicit accessible name
  // takes precedence over an inferred search purpose from page CSS metadata.
  const name = compactTargetLabel(target?.name);
  const purpose = compactTargetLabel(target?.purpose);
  if (name) {
    if (CONFIRM_READ_ONLY_FILTER_PATTERN.test(name)) {
      return !purpose || !EXTERNAL_EFFECT_LABEL_PATTERN.test(purpose);
    }
    if (READ_ONLY_QUERY_TARGET_PATTERN.test(name)) {
      return !COMBINED_EXTERNAL_EFFECT_PATTERN.test(name);
    }
    if (EXTERNAL_EFFECT_LABEL_PATTERN.test(name)) return false;
    return false;
  }
  return Boolean(purpose)
    && READ_ONLY_QUERY_TARGET_PATTERN.test(purpose)
    && !COMBINED_EXTERNAL_EFFECT_PATTERN.test(purpose);
}

function isSearchEntryTarget(target) {
  if (!target || target.credentialField || target.sensitive) return false;
  const inputLike = target.tag === "input" || target.tag === "textarea"
    || target.role === "textbox" || /^(?:search|text)$/i.test(String(target.type || ""));
  if (!inputLike) return false;
  const fieldName = String(target.fieldName || "").replace(/[-_\s]/gu, "");
  return target.type === "search"
    || SEARCH_INTENT_PATTERN.test(`${target.name || ""} ${target.purpose || ""}`)
    || SEARCH_FIELD_NAME_PATTERN.test(fieldName);
}

export function hasNegativeSubmissionConstraint(command) {
  const value = String(command || "")
    .replace(/不要忘记|别忘(?:记|了)|don't\s+forget\s+to/gi, "")
    .trim();
  return NEGATIVE_SUBMISSION_PATTERNS.some((pattern) => pattern.test(value));
}

function targetRiskCategory(target) {
  const label = `${target?.name || ""} ${target?.purpose || ""} ${target?.type || ""}`;
  if (TARGET_PATTERNS.destructive.test(label)) return "destructive";
  if (TARGET_PATTERNS.commerce.test(label)) return "commerce";
  if (TARGET_PATTERNS.communication.test(label)) return "communication";
  if (target?.submitsForm || /^(?:submit|image)$/i.test(target?.type || "") || TARGET_PATTERNS.submission.test(label)) {
    return "submission";
  }
  return "";
}

export function isSubmitLikeBrowserAction(action, target) {
  const kind = String(action?.action || "").toLowerCase();
  if (kind === "press" && /^(?:enter|return)$/i.test(String(action?.key || ""))) return true;
  if (kind !== "click") return false;
  const label = `${target?.name || ""} ${target?.purpose || ""} ${target?.type || ""}`;
  const buttonLike = target?.tag === "button"
    || target?.role === "button"
    || /^(?:button|submit|image)$/i.test(target?.type || "");
  return buttonLike
    || Boolean(target?.submitsForm)
    || /^(?:submit|image)$/i.test(target?.type || "")
    || SUBMIT_TARGET_PATTERN.test(label);
}

function commandAuthorizesCategory(command, category) {
  return Boolean(COMMAND_AUTHORIZATION_PATTERNS[category]?.test(String(command || "")));
}

export function authorizeBrowserAction({ action, command, target }) {
  const kind = String(action?.action || "").toLowerCase();
  const negativeSubmission = hasNegativeSubmissionConstraint(command);
  if (negativeSubmission && isSubmitLikeBrowserAction(action, target)) {
    return {
      allowed: false,
      code: "negative-submission-constraint",
      message: "用户明确要求只填写或查看而不提交，Brizo 已阻止该提交类动作。",
    };
  }

  // Page labels can make an action more restricted, but never grant authority.
  // Positive authority is derived exclusively from the original user command.
  if (kind === "click") {
    const category = targetRiskCategory(target);
    const readOnlyQuery = category === "submission" && isReadOnlyQueryControl(target);
    if (category && !readOnlyQuery && !commandAuthorizesCategory(command, category)) {
      return {
        allowed: false,
        code: "explicit-authorization-required",
        message: `“${target?.name || target?.ref || "该控件"}”可能产生外部影响。请在命令中明确写出要执行该操作后再试。`,
      };
    }
  }

  if (kind === "press" && /^(?:enter|return)$/i.test(String(action?.key || ""))) {
    const explicitlyRequested = EXPLICIT_ENTER_PATTERN.test(String(command || ""));
    const targetedSearch = Boolean(target)
      && (
        QUERY_INTENT_PATTERN.test(String(command || ""))
        || INFORMATION_LOOKUP_INTENT_PATTERN.test(String(command || ""))
        || Boolean(String(target?.value || "").trim())
      )
      && isSearchEntryTarget(target);
    const submissionRequested = Object.values(COMMAND_AUTHORIZATION_PATTERNS)
      .some((pattern) => pattern.test(String(command || "")));
    if (!explicitlyRequested && !targetedSearch && !submissionRequested) {
      return {
        allowed: false,
        code: "explicit-authorization-required",
        message: "按下 Enter 可能提交当前表单。请明确要求提交，或让 Brizo 重新定位目标输入框。",
      };
    }
  }

  return { allowed: true, code: "allowed", message: "" };
}
