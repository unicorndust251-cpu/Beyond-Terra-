import './SiteHeader.css';

export default function SiteHeader() {
  return (
    <header className="bt-header">
      <a className="bt-header__brand" href="#/" aria-label="Beyond Terra home">
        BEYOND TERRA
      </a>
      <nav className="bt-header__nav" aria-label="Main">
        <a href="#about">About</a>
        <a className="bt-header__cta" href="#/explore">
          Explore Mars
        </a>
      </nav>
    </header>
  );
}
