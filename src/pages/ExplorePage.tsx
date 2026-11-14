import SiteHeader from '../components/SiteHeader';
import './ExplorePage.css';

/**
 * Placeholder route for the Mars Explorer (map layers, destinations, route planning).
 * The homepage's Explore Mars button leads here, keeping the user journey intact.
 */
export default function ExplorePage() {
  return (
    <div className="bt-explore">
      <SiteHeader />
      <main className="bt-explore__main">
        <p className="bt-eyebrow">Mars Explorer</p>
        <h1>The interactive map is the next build step.</h1>
        <p>
          This is where the layered NASA map, science destinations and Marswalk route planning will live. The route is in
          place so the homepage journey already works end to end.
        </p>
        <a className="bt-button bt-button--ghost" href="#/">
          ← Back to home
        </a>
      </main>
    </div>
  );
}
