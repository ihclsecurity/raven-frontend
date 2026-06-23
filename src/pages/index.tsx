import { useEffect } from 'react'

export default function NotFoundPage() {
  useEffect(() => {
    document.title = 'Raven | Page Not Found'
  }, [])

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '32px',
        color: '#eef4ff',
        fontFamily: '"DM Sans", sans-serif',
        background: [
          'radial-gradient(circle at top left, rgba(55, 109, 255, 0.34), transparent 32%)',
          'radial-gradient(circle at right 18%, rgba(44, 164, 255, 0.16), transparent 26%)',
          'linear-gradient(180deg, #0b1424 0%, #08111e 55%, #050b14 100%)',
        ].join(', '),
      }}
    >
      <section
        style={{
          width: 'min(1080px, 100%)',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.15fr) minmax(320px, 0.85fr)',
          gap: '28px',
          padding: '28px',
          border: '1px solid rgba(110, 155, 233, 0.22)',
          borderRadius: '32px',
          background: 'linear-gradient(180deg, rgba(16, 31, 55, 0.88), rgba(7, 15, 28, 0.94))',
          boxShadow: '0 28px 70px rgba(3, 8, 20, 0.55)',
          backdropFilter: 'blur(18px)',
        }}
      >
        <article
          style={{
            position: 'relative',
            overflow: 'hidden',
            padding: '30px',
            borderRadius: '24px',
            border: '1px solid rgba(133, 167, 230, 0.16)',
            background: 'linear-gradient(180deg, rgba(10, 20, 37, 0.85), rgba(7, 15, 28, 0.94))',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '14px',
              padding: '10px 14px',
              borderRadius: '999px',
              background: 'rgba(17, 35, 65, 0.62)',
              border: '1px solid rgba(118, 157, 228, 0.2)',
            }}
          >
            <img src="/raven_mark.svg" alt="Raven mark" style={{ width: 28, height: 28 }} />
            <span
              style={{
                fontSize: '0.95rem',
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: '#d9e8ff',
              }}
            >
              Raven
            </span>
          </div>

          <div
            style={{
              margin: '28px 0 14px',
              color: '#ffc86b',
              fontSize: '0.88rem',
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
            }}
          >
            Navigation Error
          </div>

          <h1
            style={{
              margin: 0,
              maxWidth: '10ch',
              fontSize: 'clamp(3rem, 8vw, 5.8rem)',
              lineHeight: 0.92,
              letterSpacing: '-0.05em',
            }}
          >
            Signal Lost.
          </h1>

          <p
            style={{
              margin: '18px 0 0',
              maxWidth: '38rem',
              color: '#9fb3d9',
              fontSize: '1.08rem',
              lineHeight: 1.75,
            }}
          >
            The page you requested is outside the current Raven grid. It may have moved, expired, or never existed on this
            deployment. Use one of the recovery paths below to get back into the operations flow.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginTop: '28px' }}>
            <a
              href="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 170,
                padding: '15px 20px',
                borderRadius: 16,
                color: '#fff',
                textDecoration: 'none',
                fontWeight: 700,
                background: 'linear-gradient(135deg, #2ca4ff 0%, #376dff 100%)',
                boxShadow: '0 16px 34px rgba(44, 164, 255, 0.26)',
              }}
            >
              Return To Base
            </a>
            <button
              type="button"
              onClick={() => window.history.back()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 170,
                padding: '15px 20px',
                borderRadius: 16,
                border: '1px solid rgba(120, 160, 233, 0.24)',
                color: '#eef4ff',
                fontWeight: 700,
                background: 'rgba(16, 31, 55, 0.74)',
                cursor: 'pointer',
              }}
            >
              Go Back
            </button>
          </div>
        </article>

        <aside
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '22px',
            padding: '24px',
            borderRadius: '24px',
            border: '1px solid rgba(133, 167, 230, 0.16)',
            background: 'linear-gradient(180deg, rgba(10, 20, 37, 0.85), rgba(7, 15, 28, 0.94))',
          }}
        >
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 14px',
                borderRadius: '999px',
                color: '#dcebff',
                background: 'rgba(21, 38, 67, 0.78)',
                border: '1px solid rgba(123, 161, 231, 0.2)',
                fontWeight: 700,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '999px',
                  background: '#ff7d7d',
                  boxShadow: '0 0 18px rgba(255, 125, 125, 0.7)',
                }}
              />
              Page Not Found
            </div>

            <div
              aria-hidden="true"
              style={{
                width: 'min(100%, 320px)',
                aspectRatio: '1',
                margin: '26px auto',
                borderRadius: '50%',
                border: '1px solid rgba(117, 157, 228, 0.18)',
                background: [
                  'radial-gradient(circle, rgba(41, 163, 255, 0.12) 0 18%, transparent 18% 34%, rgba(65, 110, 215, 0.1) 34% 36%, transparent 36% 52%, rgba(65, 110, 215, 0.08) 52% 54%, transparent 54%)',
                  'linear-gradient(180deg, rgba(7, 15, 28, 0.95), rgba(8, 17, 30, 0.8))',
                ].join(', '),
              }}
            />

            <h2 style={{ margin: 0, fontSize: '1.5rem', letterSpacing: '-0.03em' }}>Recovery Checklist</h2>
            <p style={{ margin: '10px 0 0', color: '#9fb3d9', lineHeight: 1.7 }}>
              If this page keeps appearing, verify the route, the latest deployment, and any deep links shared from email or
              chat.
            </p>
          </div>

          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '12px' }}>
            <li
              style={{
                padding: '14px 16px',
                borderRadius: 16,
                background: 'rgba(10, 20, 37, 0.7)',
                border: '1px solid rgba(120, 158, 227, 0.14)',
                color: '#d6e4fb',
              }}
            >
              <strong style={{ color: '#fff' }}>Check the URL:</strong> watch for typoed paths, old bookmarks, or case
              mismatches.
            </li>
            <li
              style={{
                padding: '14px 16px',
                borderRadius: 16,
                background: 'rgba(10, 20, 37, 0.7)',
                border: '1px solid rgba(120, 158, 227, 0.14)',
                color: '#d6e4fb',
              }}
            >
              <strong style={{ color: '#fff' }}>Retry the app root:</strong> open `/` to reload the current Raven shell from
              the latest deployment.
            </li>
            <li
              style={{
                padding: '14px 16px',
                borderRadius: 16,
                background: 'rgba(10, 20, 37, 0.7)',
                border: '1px solid rgba(120, 158, 227, 0.14)',
                color: '#d6e4fb',
              }}
            >
              <strong style={{ color: '#fff' }}>Verify shared links:</strong> approval and snapshot routes may expire or
              require a fresh signed link.
            </li>
          </ul>
        </aside>
      </section>
    </main>
  )
}
