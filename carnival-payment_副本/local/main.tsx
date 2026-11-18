import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {Toaster} from 'sonner';
import Routes from '../client/src/app';
import './style.css';
import './theme.css';
const links = [['绑定工卡','/employee?unbound=1'],['员工首页','/employee'],['添加家人','/employee/create'],['分享家人','/employee/share/demo-family'],['我的付款','/employee/me'],['员工账单','/employee/bill/DEMO-001'],['家人页','/f/demo-family'],['家人账单','/f/demo-family/bill/DEMO-001'],['摊主绑定','/merchant?unbound=1'],['摊主首页','/merchant/home'],['收款码','/merchant/qrcode'],['摊主台账','/merchant/ledger'],['扫码付款','/pay?s=ST-demo-local']];
if (window.self !== window.top) document.documentElement.classList.add('inside-device-preview');
const desktopPreview = window.self === window.top && window.innerWidth >= 768;
document.documentElement.dataset.previewTheme = 'light';
document.documentElement.style.colorScheme = 'light';
try { localStorage.setItem('carnival-preview-theme', 'light'); } catch {}
function PreviewApp() {
  const theme = 'light' as const;
  const sidebar = <aside className={`preview-nav ${desktopPreview ? '' : 'mobile-preview-nav'}`}>
    <div className="preview-nav-heading"><strong>家年华 · 移动端预览</strong></div>
    <p>390 × 844 · 演示数据</p>{links.map(([name,url]) => <a key={url} href={url}>{name}<small>{url.split('?')[0]}</small></a>)}
  </aside>;
  return desktopPreview ? <div className="device-preview">{sidebar}<iframe title="移动端页面" className="device-frame" src={location.pathname+location.search+location.hash}/></div> : <BrowserRouter>{sidebar}<Routes previewTheme={theme}/><Toaster theme={theme} position="top-center"/></BrowserRouter>;
}
createRoot(document.getElementById('root')!).render(<PreviewApp/>);
