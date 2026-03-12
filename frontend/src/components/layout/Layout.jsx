// src/components/layout/Layout.jsx
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout() {
  return (
    <div className="flex min-h-screen w-full">
      <Sidebar />
      <main className="flex-1 min-h-screen border-r border-x-border">
          <Outlet />
      </main>
    </div>
  );
}