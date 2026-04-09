'use strict';

const {
  applyDueCoursePriceChanges,
  deleteOrphanedCoursePriceChanges,
} = require('../utils/course-price-increase');

const setupCoursePriceChangeRuntime = async ({ strapi, intervalMs }) => {
  let isApplyingCoursePriceChanges = false;
  let isShuttingDown = false;
  let currentApplyPromise = null;
  let applyInterval = null;
  const pendingApplyHandles = new Set();

  try {
    const orphanCleanup = await deleteOrphanedCoursePriceChanges(strapi);
    if (orphanCleanup && orphanCleanup.deletedChanges) {
      strapi.log.warn(`Deleted ${orphanCleanup.deletedChanges} orphaned scheduled course price change(s)`);
    }
  } catch (error) {
    strapi.log.error('Failed to delete orphaned scheduled course price changes', error);
  }

  const runCoursePriceChangeApply = async () => {
    if (isShuttingDown || isApplyingCoursePriceChanges) return null;

    isApplyingCoursePriceChanges = true;
    currentApplyPromise = (async () => {
      const result = await applyDueCoursePriceChanges(strapi);
      if (result && result.appliedChanges) {
        strapi.log.info(
          `Applied ${result.appliedChanges} scheduled course price change(s) for ${result.updatedCourses} course(s)`
        );
      }
      return result;
    })();

    try {
      return await currentApplyPromise;
    } finally {
      currentApplyPromise = null;
      isApplyingCoursePriceChanges = false;
    }
  };

  const scheduleCoursePriceChangeApply = (reason) => {
    if (isShuttingDown) return;

    const handle = setImmediate(() => {
      pendingApplyHandles.delete(handle);
      if (isShuttingDown) return;

      runCoursePriceChangeApply().catch((error) => {
        strapi.log.error(`Failed to apply scheduled course price changes ${reason}`, error);
      });
    });

    pendingApplyHandles.add(handle);
  };

  try {
    await runCoursePriceChangeApply();
  } catch (error) {
    strapi.log.error('Failed to apply scheduled course price changes on bootstrap', error);
  }

  applyInterval = setInterval(() => {
    if (isShuttingDown) return;

    runCoursePriceChangeApply().catch((error) => {
      strapi.log.error('Failed to apply scheduled course price changes', error);
    });
  }, intervalMs);

  if (typeof applyInterval.unref === 'function') {
    applyInterval.unref();
  }

  const originalDestroy = strapi.destroy.bind(strapi);
  strapi.destroy = async (...args) => {
    isShuttingDown = true;

    if (applyInterval) {
      clearInterval(applyInterval);
      applyInterval = null;
    }

    for (const handle of pendingApplyHandles) {
      clearImmediate(handle);
    }
    pendingApplyHandles.clear();

    if (currentApplyPromise) {
      try {
        await currentApplyPromise;
      } catch (error) {
        strapi.log.error('Failed to finish scheduled course price changes before shutdown', error);
      }
    }

    return originalDestroy(...args);
  };

  return {
    scheduleCoursePriceChangeApply,
  };
};

module.exports = {
  setupCoursePriceChangeRuntime,
};
