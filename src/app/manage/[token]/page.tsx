import ManageClient from './ManageClient'

export default async function ManagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <ManageClient token={token} />
}
