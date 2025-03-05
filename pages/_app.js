import Navbar from "@/components/Navbar";
import "@/styles/globals.css";
import Head from "next/head";

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>FlopSwap - Flopcoin Polygon Bridge</title>
        <meta name="description" content="FlopSwap is a secure and efficient Polygon bridge to swap your FLOP and WFLOP tokens." />
      </Head>
      <Navbar/>
      <Component {...pageProps} />
    </>
  );
}
