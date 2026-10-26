/**
 * 教程链接导入占位：只抓取站点条款和 robots.txt 允许的公开页面。
 * 只保存标题、摘要、封面 URL、原始链接、作者与来源，不下载第三方视频。
 */
const approvedSources=[];
if(!approvedSources.length){console.log('尚未配置允许抓取的来源。请先在 approvedSources 中加入已确认来源。');process.exit(0)}
// TODO: 为每个来源实现专用解析器，不绕过登录、付费墙或反爬限制。
// TODO: 将结果写入未来的 tutorial_sources 表。
