import React from 'react';

import Layout from '../components/layout';
import auth0 from '../lib/auth0';

export default function Profile({ user }) {
  return (
    <Layout>
      <h1>Profile</h1>

      <div>
        <h3>Profile (server rendered)</h3>
        <pre id="profile">{JSON.stringify(user, null, 2)}</pre>
      </div>
    </Layout>
  );
}

export const getServerSideProps = auth0.withPageAuthRequired();
