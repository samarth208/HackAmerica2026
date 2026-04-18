"""Generate and save initial CNN weights for demo/testing."""

import torch

from backend.ai.seismic_cnn import SeismicCNN

if __name__ == "__main__":
    model = SeismicCNN()
    torch.save(model.state_dict(), "backend/ai/seismic_cnn.pth")
    print("Saved pretrained weights to backend/ai/seismic_cnn.pth")
