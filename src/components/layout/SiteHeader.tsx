import Link from 'next/link';
export function SiteHeader(){return <header className="play-header"><a href="#main" className="sr-only focus:not-sr-only">Skip to game</a><Link href="/" className="play-brand">draw<em>&</em>order<span aria-hidden="true">✳</span></Link><span>THE SKETCH DEPARTMENT</span></header>}
