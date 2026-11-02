// Publishes events to the event bus /ingest endpoint. Fire-and-forget: a bus
// outage or missing config never fails the run.

/**
 * @param {{ url: string, apiKey: string, event: { type: string, detail: object } }} params
 * @returns {Promise<boolean>} true when the bus accepted the event
 */
async function publish({ url, apiKey, event }) {
  if (!url) {
    console.log('No event bus URL configured, skipping publish')
    return false
  }
  try {
    const response = await fetch(`${url}/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(event),
    })
    console.log('Event bus HTTP', response.status)
    return response.ok
  } catch (error) {
    console.warn('⚠️ Event bus publish failed (non-fatal)')
    return false
  }
}

module.exports = { publish }
