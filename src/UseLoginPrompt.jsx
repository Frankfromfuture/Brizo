import React, { useEffect, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";

export function UseLoginPrompt() {
  const [domain, setDomain] = useState("当前网站");
  const card = useRef(null);
  useEffect(() => {
    document.body.classList.add("use-login-prompt-surface");
    const unsubscribe = window.useLoginPrompt?.subscribe((state) => setDomain(state.domain));
    const observer = new ResizeObserver(() => window.useLoginPrompt?.resize(card.current.getBoundingClientRect().height));
    observer.observe(card.current);
    return () => { unsubscribe?.(); observer.disconnect(); };
  }, []);
  return <aside className="use-login-prompt" ref={card} role="status" aria-label="Use 等待登录">
    <header><span>需要登录</span><button className="use-login-prompt-close" type="button" aria-label="关闭提醒" onClick={() => window.useLoginPrompt?.dismiss()}><X size={12} aria-hidden="true" /></button></header>
    <div className="use-login-prompt-domain">{domain}</div>
    <p>请在网页中输入用户名和密码。登录完成后，继续 Use。</p>
    <button className="use-login-prompt-resume" type="button" onClick={() => window.useLoginPrompt?.resume()}>继续 Use</button>
  </aside>;
}
