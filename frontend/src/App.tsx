import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import RemediationQueue from './pages/RemediationQueue';
import RoleDetail from './pages/RoleDetail';
import DriftTimeline from './pages/DriftTimeline';
import PolicyVersions from './pages/PolicyVersions';
import ExecutiveReport from './pages/ExecutiveReport';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="queue" element={<RemediationQueue />} />
          <Route path="roles" element={<RoleDetail />} />
          <Route path="roles/:roleId" element={<RoleDetail />} />
          <Route path="drift" element={<DriftTimeline />} />
          <Route path="policies" element={<PolicyVersions />} />
          <Route path="report" element={<ExecutiveReport />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
