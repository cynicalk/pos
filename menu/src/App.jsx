import { BrowserRouter, Routes, Route } from 'react-router-dom';
import OrderMenu from './pages/OrderMenu';
import Waitlist from './pages/Waitlist';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/order/:tableId" element={<OrderMenu />} />
        <Route path="/wait/:restaurantToken" element={<Waitlist />} />
        <Route path="*" element={
          <div className="flex h-screen items-center justify-center text-sm text-slate-400">
            Scan the QR code at your table to order.
          </div>
        } />
      </Routes>
    </BrowserRouter>
  );
}
