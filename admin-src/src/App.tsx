import { Routes, Route } from 'react-router-dom';
import BuilderPage from '@/builder/BuilderPage';
import DashboardPage from '@/pages/DashboardPage';
import OffersPage from '@/pages/OffersPage';

// Migration in progress: the dashboard/funnels-list (this file's "/" route)
// and the visual builder have moved to React. AI Ads/swipe-mining still live
// at the legacy /admin only — ConsoleNav links back there for those tabs.
// See the plan doc for the full sequencing.
// Offer Finder (/app/offers) is new functionality with no legacy equivalent,
// so it was built directly in the new stack per the offer-finder plan.
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/builder/:id" element={<BuilderPage />} />
      <Route path="/offers" element={<OffersPage />} />
    </Routes>
  );
}
