import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import Layout from './components/Layout';
import NotFound from './pages/NotFound/NotFound';
import EmployeeGatePage from './pages/employee/EmployeeGatePage';
import CreateFamilyPage from './pages/employee/CreateFamilyPage';
import SharePage from './pages/employee/SharePage';
import MyCodePage from './pages/employee/MyCodePage';
import FamilyPage from './pages/family/FamilyPage';
import BillDetailPage from './pages/common/BillDetailPage';
import MerchantGatePage from './pages/merchant/MerchantGatePage';
import MerchantHomePage from './pages/merchant/MerchantHomePage';
import MerchantQrCodePage from './pages/merchant/MerchantQrCodePage';
import PayPage from './pages/pay/PayPage';
import LedgerPage from './pages/merchant/LedgerPage';
import AdminPage from './pages/admin/AdminPage';
import ConnectivityPage from './pages/connectivity/ConnectivityPage';

const RoutesComponent = ({ previewTheme = 'light' }: { previewTheme?: 'light' | 'dark' }) => {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* 根入口默认员工端（11k 员工是主用户；摊主经扫码/收藏进入，管理员直开 /admin） */}
        <Route index element={<Navigate to="/employee" replace />} />

        {/* 员工端：登录 → 身份列表（落点）→ 创建 / 分享 / 我的付款码 / 账单详情 */}
        <Route path="/employee" element={<EmployeeGatePage variant={previewTheme} />} />
        <Route path="/employee2" element={<Navigate to="/employee" replace />} />
        <Route path="/employee/create" element={<CreateFamilyPage />} />
        <Route path="/employee/share/:id" element={<SharePage />} />
        <Route path="/employee/me" element={<MyCodePage />} />
        <Route path="/employee/bill/:txnNo" element={<BillDetailPage mode="employee" />} />

        {/* 家人端：微信点开专属链接（token 免登录）→ 付款码 + 全家账单 + 详情 */}
        <Route path="/f/:token" element={<FamilyPage />} />
        <Route path="/f/:token/bill/:txnNo" element={<BillDetailPage mode="family" />} />

        {/* 摊主端：认证 + 口令绑定 → 首页（收款码）→ 全屏收款码 → 台账 */}
        <Route path="/merchant" element={<MerchantGatePage />} />
        <Route path="/merchant/home" element={<MerchantHomePage />} />
        <Route path="/merchant/qrcode" element={<MerchantQrCodePage />} />
        <Route path="/merchant/ledger" element={<LedgerPage />} />

        {/* 顾客付款页（C 扫 B）：扫摊位码进入，家人带 who=token / 员工 who=self / 无身份走引导 */}
        <Route path="/pay" element={<PayPage />} />

        {/* 管理员后台 */}
        <Route path="/admin" element={<AdminPage />} />

        {/* LEOPEN 链路诊断（运维工具，直开 URL，不入主导航） */}
        <Route path="/connectivity" element={<ConnectivityPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default RoutesComponent;
