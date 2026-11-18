import { defineConfig } from 'vite';
import path from 'node:path';
import tailwind from '@tailwindcss/postcss';
const root = path.resolve(import.meta.dirname, '..');
export default defineConfig({
 root: import.meta.dirname,
 publicDir: path.join(root,'client/public'),
 resolve: {alias:[
 {find:'@',replacement:path.join(root,'client/src')},
 {find:'@client',replacement:path.join(root,'client')},
 {find:'@shared',replacement:path.join(root,'shared')},
 {find:/^@lark-apaas\/client-toolkit\/.*/, replacement:path.resolve(import.meta.dirname,'platform.tsx')},
 ]},
 define:{'process.env.CLIENT_BASE_PATH':JSON.stringify('/')},
 css:{postcss:{plugins:[tailwind()]}},
 server:{host:'127.0.0.1',port:5173,strictPort:true,fs:{allow:[root]}},
 build:{outDir:'dist',emptyOutDir:true},
});
