import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Settings, Edit, X , Clock} from 'lucide-react'; // Added X for close button

const CronDaemonPanel = ({ isOpen = true, onClose, currentPath, npcList, jinxList, isPane = false }) => {
  const [cronJobs, setCronJobs] = useState([]);
  const [daemons, setDaemons] = useState([]);
  const [newJobCommand, setNewJobCommand] = useState('');
  const [newJobSchedule, setNewJobSchedule] = useState('* * * * *'); // default every minute
  const [newJobNPC, setNewJobNPC] = useState('');
const [newJobJinx, setNewJobJinx] = useState('');
  const [newDaemonName, setNewDaemonName] = useState('');
  const [newDaemonCommand, setNewDaemonCommand] = useState('');
  const [newDaemonNPC, setNewDaemonNPC] = useState('');
  const [newDaemonJinx, setNewDaemonJinx] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchCronAndDaemons = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await window.api.getCronDaemons(currentPath); // Using window.api
      if (response.error) {
        throw new Error(response.error);
      }
      setCronJobs(response.cronJobs || []);
      setDaemons(response.daemons || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch cron jobs and daemons');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && currentPath) { // Only fetch if panel is open and path is set
      fetchCronAndDaemons();
      // Reset input fields on open or path change
      setNewJobCommand('');
      setNewJobSchedule('* * * * *');
      setNewJobNPC('');
      setNewJobJinx('');
      setNewDaemonName('');
      setNewDaemonCommand('');
      setNewDaemonNPC('');
      setNewDaemonJinx('');
    }
  }, [isOpen, currentPath]);

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  const handleAddCronJob = async () => {
    if (!newJobCommand.trim()) return alert('Please enter command for the cron job');
    setLoading(true);
    setError(null);
    try {
      const res = await window.api.addCronJob({ // Using window.api
        path: currentPath,
        schedule: newJobSchedule,
        command: newJobCommand,
        npc: newJobNPC,
        jinx: newJobJinx,
      });
      if (res.error) throw new Error(res.error);
      await fetchCronAndDaemons();
      // Clear inputs
      setNewJobCommand('');
      setNewJobSchedule('* * * * *');
      setNewJobNPC('');
      setNewJobJinx('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveCronJob = async (jobId) => {
    setLoading(true);
    setError(null);
    try {
      const res = await window.api.removeCronJob(jobId); // Using window.api
      if (res.error) throw new Error(res.error);
      await fetchCronAndDaemons();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddDaemon = async () => {
    if (!newDaemonName.trim()) return alert('Please enter daemon name');
    if (!newDaemonCommand.trim()) return alert('Please enter daemon command');
    setLoading(true);
    setError(null);
    try {
      const res = await window.api.addDaemon({ // Using window.api
        path: currentPath,
        name: newDaemonName,
        command: newDaemonCommand,
        npc: newDaemonNPC,
        jinx: newDaemonJinx,
      });
      if (res.error) throw new Error(res.error);
      await fetchCronAndDaemons();
      // Clear inputs
      setNewDaemonName('');
      setNewDaemonCommand('');
      setNewDaemonNPC('');
      setNewDaemonJinx('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveDaemon = async (daemonId) => {
    setLoading(true);
    setError(null);
    try {
      const res = await window.api.removeDaemon(daemonId); // Using window.api
      if (res.error) throw new Error(res.error);
      await fetchCronAndDaemons();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen && !isPane) return null;

  // Content to be shared between modal and pane modes
  const content = (
    <>
      <header className={`cron-daemon-panel-header ${isPane ? 'p-4 border-b border-gray-700 flex items-center justify-between' : ''}`}>
        <h2 className="flex items-center gap-2">
          <Clock size={20} className="text-blue-400" />
          Scheduled Cron Jobs & Daemons
        </h2>
        {!isPane && onClose && (
          <button className="cron-daemon-close-btn" onClick={onClose} aria-label="Close">&times;</button>
        )}
      </header>



        <main className="p-6 space-y-6 max-h-[70vh] overflow-y-auto"> {/* Max height for scrollability */}
          {error && <div className="text-red-500 mb-2">{error}</div>}
          {loading && <div className="text-gray-400 mb-2">Loading...</div>}

          {/* Cron Jobs List */}
          <section>
            <h3 className="font-semibold text-blue-400 mb-2">Cron Jobs</h3>
            {cronJobs.length === 0 && <p className="text-gray-500 mb-4">No cron jobs defined for this folder.</p>}

            {cronJobs.map((job, idx) => (
              <div key={job.id || idx} className="flex justify-between items-center bg-[#1a2634] p-3 rounded mb-2">
                <div>
                  <div><code className="font-mono text-sm">{job.schedule}</code> - {job.command}</div>
                  <div className="text-xs text-gray-400">
                    NPC: {job.npc || '—'} | Jinx: {job.jinx || '—'}
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm(`Remove cron job: "${job.command}" ?`)) {
                      handleRemoveCronJob(job.id);
                    }
                  }}
                  title="Delete cron job"
                  className="p-1 text-red-500 hover:text-red-400"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </section>

          {/* Add new cron job */}
          <section className="border-t border-gray-600 pt-4">
            <h3 className="font-semibold text-green-400 mb-2 flex items-center gap-2">
              <Plus size={18} /> Add New Cron Job
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              <input
                type="text"
                placeholder="Schedule (* * * * *)"
                value={newJobSchedule}
                onChange={e => setNewJobSchedule(e.target.value)}
                className="col-span-full bg-[#1a2634] border border-gray-700 rounded px-2 py-1 text-sm"
              />
              <input
                type="text"
                placeholder="Command (e.g., /sample 'hello world')"
                value={newJobCommand}
                onChange={e => setNewJobCommand(e.target.value)}
                className="col-span-full bg-[#1a2634] border border-gray-700 rounded px-2 py-1 text-sm"
              />
              {/* NPC selector */}
              <select
                value={newJobNPC}
                onChange={e => setNewJobNPC(e.target.value)}
                className="col-span-2 bg-[#1a2634] border border-gray-700 rounded px-2 py-1 text-sm"
              >
                <option value=''>Select NPC (Optional)</option>
                {npcList.map(npc => (
                  <option key={npc.name} value={npc.name}>{npc.display_name || npc.name}</option>
                ))}
              </select>
              {/* Jinx selector */}
              <select
                value={newJobJinx}
                onChange={e => setNewJobJinx(e.target.value)}
                className="col-span-2 bg-[#1a2634] border border-gray-700 rounded px-2 py-1 text-sm"
              >
                <option value=''>Select Jinx (Optional)</option>
                {jinxList.map(jinx => (
                  <option key={jinx.jinx_name} value={jinx.jinx_name}>{jinx.description ? `${jinx.jinx_name} - ${jinx.description.substring(0, 30)}...` : jinx.jinx_name}</option>
                ))}
              </select>
              <button
                onClick={handleAddCronJob}
                disabled={loading || !newJobCommand.trim()}
                className="col-span-full mt-2 bg-green-600 hover:bg-green-500 rounded px-4 py-2 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Cron Job
              </button>
            </div>
          </section>

          {/* System Daemons List */}
          <section>
            <h3 className="font-semibold text-blue-400 mb-2 mt-8">System Daemons</h3>
            {daemons.length === 0 && <p className="text-gray-500 mb-4">No daemons defined for this folder.</p>}

            {daemons.map((daemon, idx) => (
              <div key={daemon.id || idx} className="flex justify-between items-center bg-[#1a2634] p-3 rounded mb-2">
                <div>
                  <div><strong>{daemon.name}</strong>: {daemon.command}</div>
                  <div className="text-xs text-gray-400">
                    NPC: {daemon.npc || '—'} | Jinx: {daemon.jinx || '—'}
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm(`Remove daemon: "${daemon.name}" ?`)) {
                      handleRemoveDaemon(daemon.id);
                    }
                  }}
                  title="Delete daemon"
                  className="p-1 text-red-500 hover:text-red-400"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </section>

          {/* Add new daemon */}
          <section className="border-t border-gray-600 pt-4">
            <h3 className="font-semibold text-green-400 mb-2 flex items-center gap-2">
              <Plus size={18} /> Add New Daemon
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              <input
                type="text"
                placeholder="Daemon Name"
                value={newDaemonName}
                onChange={e => setNewDaemonName(e.target.value)}
                className="col-span-full bg-[#1a2634] border border-gray-700 rounded px-2 py-1 text-sm"
              />
              <input
                type="text"
                placeholder="Command (e.g., /breathe)"
                value={newDaemonCommand}
                onChange={e => setNewDaemonCommand(e.target.value)}
                className="col-span-full bg-[#1a2634] border border-gray-700 rounded px-2 py-1 text-sm"
              />
              {/* NPC selector */}
              <select
                value={newDaemonNPC}
                onChange={e => setNewDaemonNPC(e.target.value)}
                className="col-span-2 bg-[#1a2634] border border-gray-700 rounded px-2 py-1 text-sm"
              >
                <option value=''>Select NPC (Optional)</option>
                {npcList.map(npc => (
                  <option key={npc.name} value={npc.name}>{npc.display_name || npc.name}</option>
                ))}
              </select>
              {/* Jinx selector */}
              <select
                value={newDaemonJinx}
                onChange={e => setNewDaemonJinx(e.target.value)}
                className="col-span-2 bg-[#1a2634] border border-gray-700 rounded px-2 py-1 text-sm"
              >
                <option value=''>Select Jinx (Optional)</option>
                {jinxList.map(jinx => (
                  <option key={jinx.jinx_name} value={jinx.jinx_name}>{jinx.description ? `${jinx.jinx_name} - ${jinx.description.substring(0, 30)}...` : jinx.jinx_name}</option>
                ))}
              </select>
              <button
                onClick={handleAddDaemon}
                disabled={loading || !newDaemonName.trim() || !newDaemonCommand.trim()}
                className="col-span-full mt-2 bg-green-600 hover:bg-green-500 rounded px-4 py-2 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Daemon
              </button>
            </div>
          </section>
        </main>
    </>
  );

  // Pane mode - render directly without modal wrapper
  if (isPane) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden theme-bg-secondary">
        {content}
      </div>
    );
  }

  // Modal mode - render with overlay
  return (
    <div className="cron-daemon-panel-overlay" onClick={onClose}>
      <div className="cron-daemon-panel-container" onClick={e => e.stopPropagation()}>
        {content}
      </div>
    </div>
  );
};

export default CronDaemonPanel;