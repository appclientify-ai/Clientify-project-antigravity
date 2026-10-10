import { getCollection } from './mongo.js';

/**
 * Sets up MongoDB Change Streams to watch for data changes and broadcast them via Socket.IO.
 * Scoped to individual practitioner rooms to prevent multi-tenant data leaks.
 */
export function initChangeStreams(io) {
  const watchConfig = { fullDocument: 'updateLookup' };
  
  // Watch the 'items' collection
  const watchItems = () => {
    try {
      const itemsCollection = getCollection('items');
      const itemStream = itemsCollection.watch([], watchConfig);

      itemStream.on('change', (change) => {
        const payload = {
          type: change.operationType, // 'insert', 'update', 'delete', 'replace'
          data: change.fullDocument,
          id: change.documentKey._id,
          updatedFields: change.updateDescription?.updatedFields,
          timestamp: new Date()
        };

        const ownerId = change.fullDocument?.createdBy?.toString();
        
        if (ownerId) {
          // Send only to the authenticated owner's room
          io.to(`user_${ownerId}`).emit('db_item_change', payload);
          if (change.operationType === 'insert') {
            io.to(`user_${ownerId}`).emit('item_created', change.fullDocument);
          }
        } else {
          // If no owner identified (e.g. on hard delete without fullDocument), emit stripped event to user rooms
          io.emit('db_item_change', {
            type: change.operationType,
            id: change.documentKey._id,
            timestamp: new Date()
          });
        }
      });

      itemStream.on('error', (err) => {
        console.error('[Stream] Item stream error:', err.message);
        try { itemStream.close(); } catch (e) {}
        setTimeout(watchItems, 5000);
      });
    } catch (err) {
      console.warn('[Stream] Could not start items watch. Likely standalone DB.', err.message);
    }
  };

  // Watch the 'users' collection for status or profile changes
  const watchUsers = () => {
    try {
      const usersCollection = getCollection('users');
      const userStream = usersCollection.watch([], watchConfig);

      userStream.on('change', (change) => {
        const userId = change.documentKey?._id?.toString();
        const payload = {
          type: change.operationType,
          id: change.documentKey._id,
          username: change.fullDocument?.username,
          status: change.fullDocument?.status,
          updatedFields: change.updateDescription?.updatedFields
        };

        if (userId) {
          io.to(`user_${userId}`).emit('db_user_change', payload);
        }
      });

      userStream.on('error', (err) => {
        console.error('[Stream] User stream error:', err.message);
        try { userStream.close(); } catch (e) {}
        setTimeout(watchUsers, 5000);
      });
    } catch (err) {
      console.warn('[Stream] Could not start users watch.', err.message);
    }
  };

  watchItems();
  watchUsers();
  console.log('📡 MongoDB Change Streams initialized (with tenant room scoping)');
}
