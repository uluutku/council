import { Archive, Bot, FileText, FolderOpen } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { artifactListQueryOptions } from '../../features/artifacts/queries/artifactQueries.js';
import { useCollectionPanelWidth } from './useCollectionPanelWidth.js';

function CountPill({ count }) {
  if (!count) return null;
  return <span className="collection-count">{count > 99 ? '99+' : count}</span>;
}

export function ArtifactsLayout() {
  const panel = useCollectionPanelWidth();
  const location = useLocation();
  const { data: artifacts = [] } = useQuery(artifactListQueryOptions());
  const archivedCount = artifacts.filter((artifact) => artifact.archived_at).length;
  const activeCount = artifacts.length - archivedCount;
  const inArtifactSection = location.pathname.startsWith('/app/artifacts');

  return (
    <div
      className="messaging-layout artifacts-layout"
      data-view="conversation"
      style={{ '--collection-panel-width': `${panel.width}px` }}
    >
      <aside className="messaging-sidebar collection-panel" aria-label="Artifacts">
        <div className="messaging-sidebar-header">
          <div>
            <h1>Artifacts</h1>
            <p>Saved AI outputs</p>
          </div>
        </div>
        <nav className="contact-collection-list" aria-label="Artifact sections">
          <NavLink
            to="/app/artifacts"
            end
            className={({ isActive }) =>
              isActive || inArtifactSection
                ? 'contact-collection-link active'
                : 'contact-collection-link'
            }
          >
            <FolderOpen aria-hidden="true" size={20} strokeWidth={2} />
            <span>
              <strong>Library</strong>
              <small>Documents, plans, and notes</small>
            </span>
            <CountPill count={artifacts.length} />
          </NavLink>
          <span className="contact-collection-link collection-link--static" aria-current="false">
            <FileText aria-hidden="true" size={20} strokeWidth={2} />
            <span>
              <strong>Active</strong>
              <small>Available for revision</small>
            </span>
            <CountPill count={activeCount} />
          </span>
          <span className="contact-collection-link collection-link--static" aria-current="false">
            <Archive aria-hidden="true" size={20} strokeWidth={2} />
            <span>
              <strong>Archived</strong>
              <small>Restorable saved work</small>
            </span>
            <CountPill count={archivedCount} />
          </span>
        </nav>
        <div className="collection-panel-cta">
          <p>Create artifacts from AI responses you want to keep.</p>
          <Link className="button button--secondary button--small" to="/app/contacts/ai">
            <Bot aria-hidden="true" size={16} strokeWidth={2.2} />
            AI contacts
          </Link>
        </div>
      </aside>
      <div
        className="collection-panel-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize artifacts list"
        aria-valuemin={panel.minWidth}
        aria-valuemax={panel.maxWidth}
        aria-valuenow={panel.width}
        tabIndex={0}
        onPointerDown={panel.startResize}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            panel.adjustWidth(-16);
          }
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            panel.adjustWidth(16);
          }
        }}
      />
      <div className="messaging-main content-panel artifacts-main">
        <Outlet />
      </div>
    </div>
  );
}
