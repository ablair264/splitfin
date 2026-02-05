// server/src/routes/imagekit.js
import express from 'express';
import { createRequire } from 'module';
import multer from 'multer';

// Import ImageKit using CommonJS syntax for ES6 modules
const require = createRequire(import.meta.url);
const ImageKit = require('imagekit');

const router = express.Router();

// Initialize ImageKit with environment variables from Render
const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});

// Multer for handling file uploads in memory
const upload = multer({ 
  storage: multer.memoryStorage(),
  // Removed fileSize limit - let ImageKit handle any size restrictions
  fileFilter: (req, file, cb) => {
    // Accept common image formats including webp
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (file.mimetype.startsWith('image/') || allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// GET /api/imagekit/auth - Authentication parameters for frontend uploads
router.get('/auth', (req, res) => {
  try {
    const authenticationParameters = imagekit.getAuthenticationParameters();
    res.json(authenticationParameters);
  } catch (error) {
    console.error('ImageKit auth error:', error);
    res.status(500).json({ error: 'Failed to generate authentication parameters' });
  }
});

// POST /api/imagekit/upload - Handle file upload to ImageKit
router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { brand, folder = 'brand-images' } = req.body;

    if (!brand) {
      return res.status(400).json({ error: 'Brand is required' });
    }

    // Upload to ImageKit
    const uploadResponse = await imagekit.upload({
      file: req.file.buffer,
      fileName: req.file.originalname,
      folder: `${folder}/${brand}`,
      useUniqueFileName: true,
      tags: [brand, 'product-image']
    });

    // Return the response with optimized URLs
    res.json({
      fileId: uploadResponse.fileId,
      name: uploadResponse.name,
      url: uploadResponse.url,
      thumbnailUrl: uploadResponse.thumbnailUrl,
      size: uploadResponse.size,
      filePath: uploadResponse.filePath,
      tags: uploadResponse.tags,
      isPrivateFile: uploadResponse.isPrivateFile,
      customCoordinates: uploadResponse.customCoordinates,
      // Add optimized versions
      optimizedUrls: {
        thumbnail: `${uploadResponse.url}?tr=w-200,h-200,c-maintain_ratio,q-80,f-auto`,
        medium: `${uploadResponse.url}?tr=w-400,h-400,c-maintain_ratio,q-85,f-auto`,
        large: `${uploadResponse.url}?tr=w-800,h-800,c-maintain_ratio,q-90,f-auto`,
        preview: `${uploadResponse.url}?tr=w-100,h-100,c-maintain_ratio,q-60,f-auto,bl-10`
      }
    });

  } catch (error) {
    console.error('ImageKit upload error:', error);
    res.status(500).json({ 
      error: 'Upload failed', 
      details: error.message 
    });
  }
});

// POST /api/imagekit/upload-multiple - Handle multiple file uploads
router.post('/upload-multiple', upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    const { brand, folder = 'brand-images' } = req.body;

    if (!brand) {
      return res.status(400).json({ error: 'Brand is required' });
    }

    // Upload all files to ImageKit
    const uploadPromises = req.files.map(file => 
      imagekit.upload({
        file: file.buffer,
        fileName: file.originalname,
        folder: `${folder}/${brand}`,
        useUniqueFileName: true,
        tags: [brand, 'product-image']
      })
    );

    const uploadResponses = await Promise.allSettled(uploadPromises);

    const results = uploadResponses.map((result, index) => {
      if (result.status === 'fulfilled') {
        const response = result.value;
        return {
          success: true,
          fileId: response.fileId,
          name: response.name,
          url: response.url,
          size: response.size,
          optimizedUrls: {
            thumbnail: `${response.url}?tr=w-200,h-200,c-maintain_ratio,q-80,f-auto`,
            medium: `${response.url}?tr=w-400,h-400,c-maintain_ratio,q-85,f-auto`,
            large: `${response.url}?tr=w-800,h-800,c-maintain_ratio,q-90,f-auto`,
            preview: `${response.url}?tr=w-100,h-100,c-maintain_ratio,q-60,f-auto,bl-10`
          }
        };
      } else {
        return {
          success: false,
          fileName: req.files[index].originalname,
          error: result.reason.message
        };
      }
    });

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    res.json({
      totalUploaded: successful.length,
      totalFailed: failed.length,
      successful,
      failed
    });

  } catch (error) {
    console.error('Multiple upload error:', error);
    res.status(500).json({ 
      error: 'Batch upload failed', 
      details: error.message 
    });
  }
});

// GET /api/imagekit/images - List all images (with pagination)
router.get('/images', async (req, res) => {
  try {
    const { 
      skip = 0, 
      limit = 50,  // Changed default to 50 to match frontend
      searchQuery = '', 
      tags = '',
      folder = 'brand-images'
    } = req.query;

    console.log('ImageKit API call parameters:', {
      skip,
      limit,
      searchQuery,
      tags,
      folder,
      sort: 'createdAt-DESC'
    });

    const listOptions = {
      skip: parseInt(skip),
      limit: parseInt(limit),
      sort: 'createdAt-DESC' // Sort by creation date, newest first - changed from ASC
    };

    // Add path if folder is specified
    if (folder && folder.trim() !== '') {
      if (folder === 'brand-images') {
        // For brand-images, let's try without any path restrictions first
        // Just get ALL files and we'll filter by path on the client side
        console.log('Fetching all images from brand-images folder');
        // Don't set any path or searchQuery initially
      } else if (folder.startsWith('brand-images/')) {
        // Specific brand folder like 'brand-images/blomus'
        listOptions.path = folder;
        console.log('Using specific brand folder path:', folder);
      } else {
        listOptions.path = folder;
        console.log('Using folder path:', folder);
      }
    }
    
    if (searchQuery) {
      listOptions.searchQuery = `name : "${searchQuery}"`;
    }

    if (tags) {
      listOptions.tags = tags.split(',');
    }

    console.log('Final ImageKit listOptions:', listOptions);

    const allItems = await imagekit.listFiles(listOptions);
    
    // Filter out folders - we only want actual image files
    let imageList = allItems.filter(item => item.type !== 'folder');
    
    console.log(`ImageKit returned ${allItems.length} items, ${imageList.length} are image files`);
    
    // Log if we find the specific CRS10 image
    const crs10Image = imageList.find(img => img.name && img.name.includes('CRS10'));
    if (crs10Image) {
      console.log('Found CRS10 image in API response:', {
        name: crs10Image.name,
        createdAt: crs10Image.createdAt,
        updatedAt: crs10Image.updatedAt,
        filePath: crs10Image.filePath
      });
    } else if (folder.includes('remember')) {
      console.log('CRS10 image NOT found in Remember folder response');
    }
    
    // If we're looking for brand-images (but not a specific brand) and got files, filter them by path
    if (folder === 'brand-images' && imageList.length > 0) {
      const beforeFilter = imageList.length;
      imageList = imageList.filter(img => 
        img.filePath && 
        (img.filePath.includes('/brand-images/') || img.filePath.startsWith('brand-images/'))
      );
      console.log(`Filtered from ${beforeFilter} to ${imageList.length} images in brand-images folder`);
    }
    
    // Log the structure of the first image for debugging
    if (imageList.length > 0) {
      console.log('First image structure:', JSON.stringify(imageList[0], null, 2));
      console.log('Available fields:', Object.keys(imageList[0]));
      console.log('Sample images:', imageList.slice(0, 3).map(img => ({
        name: img.name,
        fileId: img.fileId,
        filePath: img.filePath,
        url: img.url,
        size: img.size,
        createdAt: img.createdAt,
        tags: img.tags,
        type: img.type || img.fileType
      })));
    }

    // Add optimized URLs to each image
    const imagesWithOptimizedUrls = imageList.map(image => ({
      ...image,
      optimizedUrls: {
        thumbnail: `${image.url}?tr=w-200,h-200,c-maintain_ratio,q-80,f-auto`,
        medium: `${image.url}?tr=w-400,h-400,c-maintain_ratio,q-85,f-auto`,
        large: `${image.url}?tr=w-800,h-800,c-maintain_ratio,q-90,f-auto`,
        preview: `${image.url}?tr=w-100,h-100,c-maintain_ratio,q-60,f-auto,bl-10`
      }
    }));

    const response = {
      images: imagesWithOptimizedUrls,
      hasMore: imageList.length === parseInt(limit), // If we got a full page, there might be more
      total: imageList.length, // Images in this response
      requestParams: { skip, limit, folder, searchQuery, tags }
    };

    console.log('API Response summary:', {
      totalImages: response.images.length,
      hasMore: response.hasMore,
      totalAvailable: response.total,
      skip: skip,
      limit: limit
    });

    res.json(response);

  } catch (error) {
    console.error('ImageKit list error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      response: error.response?.data
    });
    
    res.status(500).json({ 
      error: 'Failed to fetch images', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// DELETE /api/imagekit/images/:fileId - Delete a single image
router.delete('/images/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;

    if (!fileId) {
      return res.status(400).json({ error: 'File ID is required' });
    }

    await imagekit.deleteFile(fileId);
    
    res.json({ 
      success: true, 
      message: 'Image deleted successfully' 
    });

  } catch (error) {
    console.error('ImageKit delete error:', error);
    res.status(500).json({ 
      error: 'Failed to delete image', 
      details: error.message 
    });
  }
});

// DELETE /api/imagekit/images/bulk - Delete multiple images
router.delete('/images/bulk', async (req, res) => {
  try {
    const { fileIds } = req.body;

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({ error: 'File IDs array is required' });
    }

    // Delete in batches to avoid overwhelming the API
    const batchSize = 5;
    const results = [];

    for (let i = 0; i < fileIds.length; i += batchSize) {
      const batch = fileIds.slice(i, i + batchSize);
      const batchPromises = batch.map(async (fileId) => {
        try {
          await imagekit.deleteFile(fileId);
          return { fileId, success: true };
        } catch (error) {
          return { fileId, success: false, error: error.message };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Small delay between batches
      if (i + batchSize < fileIds.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    res.json({
      totalDeleted: successful.length,
      totalFailed: failed.length,
      successful: successful.map(r => r.fileId),
      failed: failed.map(r => ({ fileId: r.fileId, error: r.error }))
    });

  } catch (error) {
    console.error('Bulk delete error:', error);
    res.status(500).json({ 
      error: 'Bulk delete failed', 
      details: error.message 
    });
  }
});

// GET /api/imagekit/config - Get public configuration for frontend
router.get('/config', (req, res) => {
  res.json({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
  });
});

// Test endpoint
router.get('/test', (req, res) => {
  res.json({
    message: 'ImageKit routes are working!',
    timestamp: new Date().toISOString(),
    config: {
      hasPublicKey: !!process.env.IMAGEKIT_PUBLIC_KEY,
      hasPrivateKey: !!process.env.IMAGEKIT_PRIVATE_KEY,
      hasUrlEndpoint: !!process.env.IMAGEKIT_URL_ENDPOINT
    }
  });
});

// Debug endpoint to test ImageKit connection and list all files
router.get('/debug/list-all', async (req, res) => {
  try {
    console.log('Debug: Listing all files from ImageKit');
    
    // First try to list files without any path restriction
    const allFiles = await imagekit.listFiles({
      limit: 100
    });
    
    console.log(`Found ${allFiles.length} total files`);
    
    // List specific brand folders to see what's inside
    const brandFolders = ['blomus', 'elvang', 'my-flame', 'remember', 'rader', 'relaxound', 'biomus']; // Added biomus in case
    const filesByBrand = {};
    
    for (const brand of brandFolders) {
      try {
        const brandFiles = await imagekit.listFiles({
          path: `brand-images/${brand}`,
          limit: 50
        });
        filesByBrand[brand] = brandFiles.filter(item => item.type !== 'folder');
        console.log(`Found ${filesByBrand[brand].length} files in brand-images/${brand}`);
      } catch (error) {
        console.log(`Error listing ${brand}: ${error.message}`);
        filesByBrand[brand] = [];
      }
    }
    
    // Try with search query for all files under brand-images
    const searchQueryFiles = await imagekit.listFiles({
      searchQuery: 'filePath : "/brand-images/*" OR filePath : "/brand-images/*/*"',
      limit: 100
    });
    
    console.log(`Found ${searchQueryFiles.length} files with search query`);
    
    const imageFiles = searchQueryFiles.filter(item => item.type !== 'folder');
    console.log(`Found ${imageFiles.length} actual image files`);
    
    res.json({
      success: true,
      summary: {
        totalFiles: allFiles.length,
        searchQueryFiles: searchQueryFiles.length,
        actualImageFiles: imageFiles.length,
        filesByBrand: Object.keys(filesByBrand).reduce((acc, brand) => {
          acc[brand] = filesByBrand[brand].length;
          return acc;
        }, {})
      },
      samples: {
        allFiles: allFiles.slice(0, 5).map(f => ({
          name: f.name,
          filePath: f.filePath,
          type: f.type,
          size: f.size,
          url: f.url,
          tags: f.tags
        })),
        imageFiles: imageFiles.slice(0, 10).map(f => ({
          name: f.name,
          filePath: f.filePath,
          type: f.type,
          url: f.url,
          brand: f.filePath?.split('/')[2] || 'unknown'
        })),
        sampleBrandFiles: Object.keys(filesByBrand).reduce((acc, brand) => {
          if (filesByBrand[brand].length > 0) {
            acc[brand] = filesByBrand[brand].slice(0, 2).map(f => ({
              name: f.name,
              filePath: f.filePath,
              url: f.url
            }));
          }
          return acc;
        }, {})
      },
      rawResponses: {
        firstAllFile: allFiles[0],
        firstImageFile: imageFiles[0]
      }
    });
    
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// Debug endpoint to understand file structure
router.get('/debug/structure', async (req, res) => {
  try {
    console.log('Debug: Analyzing ImageKit file structure');
    
    // Get a larger sample of files
    const allItems = await imagekit.listFiles({ limit: 500 });
    
    // Separate files and folders
    const files = allItems.filter(item => item.type !== 'folder');
    const folders = allItems.filter(item => item.type === 'folder');
    
    // Analyze file paths
    const pathAnalysis = {};
    files.forEach(file => {
      const pathParts = file.filePath?.split('/').filter(p => p);
      if (pathParts && pathParts.length > 0) {
        const rootFolder = pathParts[0];
        if (!pathAnalysis[rootFolder]) {
          pathAnalysis[rootFolder] = {
            count: 0,
            samples: [],
            subPaths: new Set()
          };
        }
        pathAnalysis[rootFolder].count++;
        if (pathAnalysis[rootFolder].samples.length < 3) {
          pathAnalysis[rootFolder].samples.push({
            name: file.name,
            filePath: file.filePath,
            url: file.url?.substring(0, 100) + '...'
          });
        }
        if (pathParts.length > 1) {
          pathAnalysis[rootFolder].subPaths.add(pathParts[1]);
        }
      }
    });
    
    // Convert Sets to Arrays for JSON
    Object.keys(pathAnalysis).forEach(key => {
      pathAnalysis[key].subPaths = Array.from(pathAnalysis[key].subPaths);
    });
    
    // Look specifically for brand-images
    const brandImagesFiles = files.filter(f => 
      f.filePath && f.filePath.includes('brand-images')
    );
    
    res.json({
      summary: {
        totalItems: allItems.length,
        totalFiles: files.length,
        totalFolders: folders.length,
        brandImagesFiles: brandImagesFiles.length
      },
      pathAnalysis,
      brandImagesSamples: brandImagesFiles.slice(0, 10).map(f => ({
        name: f.name,
        filePath: f.filePath,
        fileId: f.fileId,
        url: f.url?.substring(0, 100) + '...'
      })),
      firstFewFiles: files.slice(0, 10).map(f => ({
        name: f.name,
        filePath: f.filePath,
        type: f.type,
        fileId: f.fileId
      })),
      message: `Found ${files.length} files. ${brandImagesFiles.length} are in brand-images folder.`
    });
    
  } catch (error) {
    console.error('Debug structure error:', error);
    res.status(500).json({ 
      error: error.message,
      stack: error.stack 
    });
  }
});

// Debug specific brand endpoint
router.get('/debug/brand/:brandId', async (req, res) => {
  try {
    const { brandId } = req.params;
    console.log(`Debug: Checking brand ${brandId}`);
    
    // Get all files for this brand with no limit to see everything
    const brandFiles = await imagekit.listFiles({
      path: `brand-images/${brandId}`,
      limit: 1000
    });
    
    const imageFiles = brandFiles.filter(item => item.type !== 'folder');
    
    // Sort by creation date to see newest first
    imageFiles.sort((a, b) => {
      const dateA = new Date(a.createdAt || a.updatedAt || 0);
      const dateB = new Date(b.createdAt || b.updatedAt || 0);
      return dateB - dateA;
    });
    
    res.json({
      brand: brandId,
      totalFiles: imageFiles.length,
      newestFiles: imageFiles.slice(0, 10).map(f => ({
        name: f.name,
        fileId: f.fileId,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
        uploadedAt: f.uploadedAt,
        size: f.size,
        url: f.url
      })),
      oldestFiles: imageFiles.slice(-5).map(f => ({
        name: f.name,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt
      })),
      dateRange: imageFiles.length > 0 ? {
        newest: imageFiles[0].createdAt || imageFiles[0].updatedAt,
        oldest: imageFiles[imageFiles.length - 1].createdAt || imageFiles[imageFiles.length - 1].updatedAt
      } : null
    });
    
  } catch (error) {
    console.error('Debug brand error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Simple test to check if we have any images
router.get('/test/simple', async (req, res) => {
  try {
    // Try to get ANY file (not folder)
    const allItems = await imagekit.listFiles({ limit: 1000 });
    const files = allItems.filter(item => item.type !== 'folder');
    const folders = allItems.filter(item => item.type === 'folder');
    
    // Try specific brand paths
    let brandResults = {};
    const brands = ['blomus', 'elvang', 'my-flame'];
    
    for (const brand of brands) {
      try {
        const items = await imagekit.listFiles({ 
          path: `brand-images/${brand}`,
          limit: 50 
        });
        brandResults[brand] = {
          total: items.length,
          files: items.filter(i => i.type !== 'folder').length,
          folders: items.filter(i => i.type === 'folder').length,
          samples: items.slice(0, 3).map(i => ({ 
            name: i.name, 
            type: i.type,
            filePath: i.filePath 
          }))
        };
      } catch (e) {
        brandResults[brand] = { error: e.message };
      }
    }
    
    res.json({
      summary: {
        totalItems: allItems.length,
        totalFiles: files.length,
        totalFolders: folders.length
      },
      brandResults,
      sampleFiles: files.slice(0, 5).map(f => ({
        name: f.name,
        filePath: f.filePath,
        url: f.url
      })),
      message: files.length === 0 ? 
        'No image files found. Please upload images to the brand folders in ImageKit.' : 
        `Found ${files.length} image files`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test Remember folder specifically
router.get('/test/remember', async (req, res) => {
  try {
    console.log('Testing Remember folder specifically');
    
    // Get ALL files from remember folder with no limit
    const allFiles = await imagekit.listFiles({
      path: 'brand-images/remember',
      limit: 1000,
      sort: 'createdAt-DESC'
    });
    
    const imageFiles = allFiles.filter(item => item.type !== 'folder');
    
    // Look for CRS10 specifically
    const crs10Files = imageFiles.filter(img => img.name && img.name.includes('CRS10'));
    
    res.json({
      totalFiles: imageFiles.length,
      crs10Files: crs10Files.map(f => ({
        name: f.name,
        fileId: f.fileId,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
        url: f.url,
        filePath: f.filePath
      })),
      newestFiles: imageFiles.slice(0, 10).map(f => ({
        name: f.name,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt
      })),
      message: crs10Files.length > 0 ? 
        `Found ${crs10Files.length} CRS10 files` : 
        'No CRS10 files found in Remember folder'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;