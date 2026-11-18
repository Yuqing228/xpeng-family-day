import React from 'react';
import {localRequest} from './mock';
export const logger = console;
export const authClient = {session:{redirectToLogin:async()=>{location.href='/employee'}}};
export const axiosForBackend = async (config:any) => ({status:200,data:await localRequest(config)});
export const UniversalLink = ({children,...props}:any)=><a {...props}>{children}</a>;
export const NotFoundRender = ()=> <p>页面不存在 <a href="/employee">返回首页</a></p>;
