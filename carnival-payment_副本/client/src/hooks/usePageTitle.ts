// 分角色 H5 标签页标题：每页调用一次，切换路由时更新浏览器/webview 顶部标题
import { useEffect } from 'react';

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
